-- 005 : photos des articles.
-- Stockage binaire par article, opération de synchronisation dédiée (une simple
-- modification de prix ne renvoie jamais la photo) et lecture paresseuse côté appareil.

create table if not exists public.product_images (
  product_id uuid primary key references public.products(id) on delete cascade,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  data       bytea not null,
  mime       text not null default 'image/jpeg',
  updated_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy product_images_select_member on public.product_images
  for select using (public.is_shop_member(shop_id));

-- Mise à jour de la photo : remplace ou supprime (« clear »).
create or replace function public.op_update_product_image(p_op_id uuid, p_shop_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid      uuid := (p_payload ->> 'product_id')::uuid;
  v_clear    boolean := coalesce((p_payload ->> 'clear')::boolean, false);
  v_b64      text := p_payload ->> 'image_base64';
  v_mime     text := coalesce(nullif(btrim(p_payload ->> 'mime'), ''), 'image/jpeg');
  v_at       timestamptz;
  v_data     bytea;
begin
  begin
    v_at := coalesce((p_payload ->> 'image_updated_at')::timestamptz, now());
  exception when others then
    v_at := now();
  end;

  if v_pid is null or not exists (select 1 from public.products where id = v_pid and shop_id = p_shop_id) then
    return jsonb_build_object('status', 'failed', 'code', 'product_not_found', 'product_id', v_pid);
  end if;

  if v_clear then
    delete from public.product_images where product_id = v_pid;
    return jsonb_build_object('status', 'applied', 'product_id', v_pid, 'cleared', true);
  end if;

  if v_b64 is null or char_length(v_b64) = 0 then
    return jsonb_build_object('status', 'failed', 'code', 'image_required');
  end if;
  if char_length(v_b64) > 4000000 then
    return jsonb_build_object('status', 'failed', 'code', 'image_too_large');
  end if;

  begin
    v_data := decode(v_b64, 'base64');
  exception when others then
    return jsonb_build_object('status', 'failed', 'code', 'image_invalid');
  end;

  insert into public.product_images (product_id, shop_id, data, mime, updated_at)
  values (v_pid, p_shop_id, v_data, v_mime, v_at)
  on conflict (product_id) do update
    set data = excluded.data,
        mime = excluded.mime,
        updated_at = greatest(public.product_images.updated_at, excluded.updated_at);

  return jsonb_build_object('status', 'applied', 'product_id', v_pid);
end;
$$;

-- Point d'entrée unique : reconstruit avec la branche « update_product_image ».
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
    when 'create_order'          then v_result := public.op_create_order(p_op_id, v_shop_id, p_payload);
    when 'cancel_order'          then v_result := public.op_cancel_order(p_op_id, v_shop_id, p_payload);
    when 'update_order'          then v_result := public.op_update_order(p_op_id, v_shop_id, p_payload);
    when 'upsert_product'        then v_result := public.op_upsert_product(p_op_id, v_shop_id, p_payload);
    when 'update_product_image'  then v_result := public.op_update_product_image(p_op_id, v_shop_id, p_payload);
    when 'stock_movement'        then v_result := public.op_stock_movement(p_op_id, v_shop_id, p_payload);
    when 'update_shop'           then v_result := public.op_update_shop(p_op_id, v_shop_id, p_payload);
    else raise exception 'unknown_operation_type' using errcode = '22023';
  end case;

  if v_result ->> 'status' in ('applied', 'already_applied') then
    insert into public.remote_operations (op_id, shop_id, op_type, result)
    values (p_op_id, v_shop_id, p_op_type, v_result);
  end if;

  return v_result;
end;
$$;

revoke all on function public.op_update_product_image(uuid, uuid, jsonb) from public;
revoke all on function public.apply_sync_operation(uuid, text, jsonb) from public;
