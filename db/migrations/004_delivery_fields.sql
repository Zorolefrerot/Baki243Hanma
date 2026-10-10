-- 004 : informations client et livraison sur les commandes (commandes WhatsApp à livrer).
-- Ajoute des colonnes optionnelles sur public.orders, enrichit la création de commande
-- et ajoute une opération de mise à jour du suivi (paiement / livraison).

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_date date,
  add column if not exists payment_status text not null default 'paid',
  add column if not exists delivery_status text;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check check (payment_status in ('paid', 'unpaid'));

alter table public.orders drop constraint if exists orders_delivery_status_check;
alter table public.orders
  add constraint orders_delivery_status_check
  check (delivery_status is null or delivery_status in ('to_prepare', 'ready', 'delivered'));

create index if not exists orders_delivery_idx
  on public.orders(shop_id, delivery_date)
  where delivery_date is not null;

-- Création de commande : enregistre aussi les informations client / livraison fournies.
create or replace function public.op_create_order(p_op_id uuid, p_shop_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o            jsonb := p_payload -> 'order';
  v_order_id   uuid;
  v_created    timestamptz;
  v_pay        text;
  it           jsonb;
  v_pid        uuid;
  v_qty        integer;
  v_price      bigint;
  v_cost       bigint;
  v_name       text;
  v_product    public.products%rowtype;
  v_seen       uuid[] := '{}';
  v_total      bigint := 0;
  v_cost_total bigint := 0;
  v_qty_total  bigint := 0;
  v_count      integer := 0;
  v_customer   text;
  v_phone      text;
  v_address    text;
  v_del_date   date;
  v_pay_status text;
  v_del_status text;
begin
  if o is null or jsonb_typeof(o) <> 'object' then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_payload');
  end if;

  v_order_id := (o ->> 'id')::uuid;
  v_created  := (o ->> 'created_at')::timestamptz;
  v_pay      := o ->> 'payment_method';

  if exists (select 1 from public.orders where id = v_order_id) then
    return jsonb_build_object('status', 'already_applied', 'order_id', v_order_id);
  end if;

  if v_pay not in ('cash', 'mobile_money', 'other') then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_payment_method');
  end if;

  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    return jsonb_build_object('status', 'failed', 'code', 'empty_order');
  end if;

  -- Informations client / livraison (facultatives).
  v_customer   := nullif(btrim(coalesce(o ->> 'customer_name', '')), '');
  v_phone      := nullif(btrim(coalesce(o ->> 'customer_phone', '')), '');
  v_address    := nullif(btrim(coalesce(o ->> 'delivery_address', '')), '');
  begin
    v_del_date := nullif(o ->> 'delivery_date', '')::date;
  exception when others then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_delivery_date');
  end;
  v_pay_status := coalesce(o ->> 'payment_status', 'paid');
  v_del_status := o ->> 'delivery_status';

  if v_pay_status not in ('paid', 'unpaid') then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_payment_status');
  end if;
  if v_del_status is not null and v_del_status not in ('to_prepare', 'ready', 'delivered') then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_delivery_status');
  end if;

  -- Passe 1 : validation, verrouillage des articles, calcul des totaux (aucune écriture).
  for it in select value from jsonb_array_elements(p_payload -> 'items') loop
    v_pid   := (it ->> 'product_id')::uuid;
    v_qty   := (it ->> 'quantity')::integer;
    v_price := (it ->> 'unit_price')::bigint;
    v_cost  := (it ->> 'unit_cost')::bigint;

    if v_pid = any(v_seen) then
      return jsonb_build_object('status', 'failed', 'code', 'duplicate_product_line', 'product_id', v_pid);
    end if;
    v_seen := v_seen || v_pid;

    if v_qty is null or v_qty <= 0 then
      return jsonb_build_object('status', 'failed', 'code', 'invalid_quantity', 'product_id', v_pid);
    end if;
    if v_price is null or v_price <= 0 or v_cost is null or v_cost < 0 then
      return jsonb_build_object('status', 'failed', 'code', 'invalid_price', 'product_id', v_pid);
    end if;

    select * into v_product
    from public.products
    where id = v_pid and shop_id = p_shop_id
    for update;

    if not found then
      return jsonb_build_object('status', 'failed', 'code', 'product_not_found', 'product_id', v_pid);
    end if;

    if v_product.quantity < v_qty then
      return jsonb_build_object(
        'status', 'failed',
        'code', 'insufficient_stock',
        'product_id', v_pid,
        'product_name', v_product.name,
        'available', v_product.quantity,
        'requested', v_qty
      );
    end if;

    v_total      := v_total + v_price * v_qty;
    v_cost_total := v_cost_total + v_cost * v_qty;
    v_qty_total  := v_qty_total + v_qty;
    v_count      := v_count + 1;
  end loop;

  -- Passe 2 : écritures (dans la même transaction que l'appel RPC).
  insert into public.orders (
    id, shop_id, status, payment_method, total_amount, total_cost, total_quantity, created_at, updated_at,
    customer_name, customer_phone, delivery_address, delivery_date, payment_status, delivery_status
  ) values (
    v_order_id, p_shop_id, 'confirmed', v_pay, v_total, v_cost_total, v_qty_total::integer, v_created, v_created,
    v_customer, v_phone, v_address, v_del_date, v_pay_status, v_del_status
  );

  for it in select value from jsonb_array_elements(p_payload -> 'items') loop
    v_pid   := (it ->> 'product_id')::uuid;
    v_qty   := (it ->> 'quantity')::integer;
    v_price := (it ->> 'unit_price')::bigint;
    v_cost  := (it ->> 'unit_cost')::bigint;
    v_name  := it ->> 'product_name';

    insert into public.order_items (id, order_id, shop_id, product_id, product_name, unit_price, unit_cost, quantity)
    values ((it ->> 'id')::uuid, v_order_id, p_shop_id, v_pid, coalesce(nullif(btrim(v_name), ''), 'Article'), v_price, v_cost, v_qty);

    update public.products
    set quantity = quantity - v_qty, updated_at = greatest(updated_at, v_created)
    where id = v_pid
    returning * into v_product;

    insert into public.stock_movements (
      id, shop_id, product_id, order_id, type, quantity_delta, quantity_after, reason, created_at
    ) values (
      (it ->> 'movement_id')::uuid, p_shop_id, v_pid, v_order_id, 'sale', -v_qty, v_product.quantity, 'Vente', v_created
    );
  end loop;

  return jsonb_build_object(
    'status', 'applied',
    'order_id', v_order_id,
    'total_amount', v_total,
    'total_cost', v_cost_total,
    'gross_margin', v_total - v_cost_total,
    'total_quantity', v_qty_total,
    'line_count', v_count
  );
end;
$$;

-- Mise à jour du suivi : état du paiement et/ou de la livraison.
create or replace function public.op_update_order(p_op_id uuid, p_shop_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id   uuid := (p_payload ->> 'order_id')::uuid;
  v_pay_status text := p_payload ->> 'payment_status';
  v_del_status text := p_payload ->> 'delivery_status';
  v_at         timestamptz;
begin
  begin
    v_at := coalesce((p_payload ->> 'updated_at')::timestamptz, now());
  exception when others then
    v_at := now();
  end;

  if v_order_id is null then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_payload');
  end if;
  if v_pay_status is not null and v_pay_status not in ('paid', 'unpaid') then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_payment_status');
  end if;
  if v_del_status is not null and v_del_status not in ('to_prepare', 'ready', 'delivered') then
    return jsonb_build_object('status', 'failed', 'code', 'invalid_delivery_status');
  end if;
  if v_pay_status is null and v_del_status is null then
    return jsonb_build_object('status', 'failed', 'code', 'nothing_to_update');
  end if;

  if not exists (select 1 from public.orders where id = v_order_id and shop_id = p_shop_id) then
    return jsonb_build_object('status', 'failed', 'code', 'order_not_found', 'order_id', v_order_id);
  end if;

  update public.orders
  set payment_status = coalesce(v_pay_status, payment_status),
      delivery_status = coalesce(v_del_status, delivery_status),
      updated_at = greatest(updated_at, v_at)
  where id = v_order_id and shop_id = p_shop_id;

  return jsonb_build_object('status', 'applied', 'order_id', v_order_id);
end;
$$;

-- Point d'entrée unique : reconstruit avec la branche « update_order ».
create or replace function public.apply_sync_operation(p_op_id uuid, p_op_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id  uuid;
  v_existing jsonb;
  v_result   jsonb;
begin
  if p_op_id is null or p_payload is null or p_op_type is null then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;

  begin
    v_shop_id := (p_payload ->> 'shop_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_shop_id' using errcode = '22023';
  end;

  if v_shop_id is null or not public.is_shop_member(v_shop_id) then
    raise exception 'forbidden_shop' using errcode = '42501';
  end if;

  -- Sérialise les opérations d'une même boutique (cohérence du stock).
  perform pg_advisory_xact_lock(hashtextextended(v_shop_id::text, 0));

  select result into v_existing from public.remote_operations where op_id = p_op_id;
  if found then
    return v_existing || jsonb_build_object('duplicate', true);
  end if;

  case p_op_type
    when 'create_order'   then v_result := public.op_create_order(p_op_id, v_shop_id, p_payload);
    when 'cancel_order'   then v_result := public.op_cancel_order(p_op_id, v_shop_id, p_payload);
    when 'update_order'   then v_result := public.op_update_order(p_op_id, v_shop_id, p_payload);
    when 'upsert_product' then v_result := public.op_upsert_product(p_op_id, v_shop_id, p_payload);
    when 'stock_movement' then v_result := public.op_stock_movement(p_op_id, v_shop_id, p_payload);
    when 'update_shop'    then v_result := public.op_update_shop(p_op_id, v_shop_id, p_payload);
    else raise exception 'unknown_operation_type' using errcode = '22023';
  end case;

  if v_result ->> 'status' in ('applied', 'already_applied') then
    insert into public.remote_operations (op_id, shop_id, op_type, result)
    values (p_op_id, v_shop_id, p_op_type, v_result);
  end if;

  return v_result;
end;
$$;

revoke all on function public.op_create_order(uuid, uuid, jsonb) from public;
revoke all on function public.op_update_order(uuid, uuid, jsonb) from public;
revoke all on function public.apply_sync_operation(uuid, text, jsonb) from public;
