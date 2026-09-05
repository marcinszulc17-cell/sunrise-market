import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "booking-protocols";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const BUYER_FIELDS = [
  "id", "status", "resource_kind",
  "handover_at", "handover_odometer", "handover_fuel_percent", "handover_condition", "handover_notes", "handover_kit_complete",
  "return_at", "return_odometer", "return_fuel_percent", "return_condition", "return_notes", "return_kit_complete",
  "damage_found", "damage_note", "deposit_decision", "deposit_retained_requested_gross", "deposit_decision_note",
  "handover_buyer_status", "handover_buyer_responded_at", "handover_buyer_note",
  "return_buyer_status", "return_buyer_responded_at", "return_buyer_note",
  "handover_code_verified_at", "return_code_verified_at",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "zdjecie.jpg";
}
function numOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
const PHOTO_MAX_AGE_MS = 15 * 60 * 1000;        // zdjęcie z EXIF starsze niż 15 min → odrzucone (musi być zrobione „teraz”)
const HANDOVER_WINDOW_BEFORE_MS = 24 * 3600 * 1000; // wydanie: od 24 h przed startem najmu
const RETURN_WINDOW_AFTER_MS = 72 * 3600 * 1000;    // zwrot: do 72 h po końcu najmu
const PHOTO_FIELDS = "id,phase,file_name,mime_type,created_at,sha256,size_bytes,exif_taken_at,capture_source,uploaded_role,lat,lon";

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** DateTimeOriginal (0x9003) z EXIF w JPEG; null gdy brak. Minimalny parser — bez zewnętrznych bibliotek. */
function exifTakenAt(bytes: ArrayBuffer): Date | null {
  try {
    const v = new DataView(bytes);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) return null;
      const marker = v.getUint8(off + 1);
      const len = v.getUint16(off + 2);
      if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) { // "Exif"
        const tiff = off + 10;
        const le = v.getUint16(tiff) === 0x4949;
        const u16 = (p: number) => v.getUint16(p, le);
        const u32 = (p: number) => v.getUint32(p, le);
        const ifd0 = tiff + u32(tiff + 4);
        const readIfd = (ifd: number): number | null => {
          if (ifd + 2 > v.byteLength) return null;
          const n = u16(ifd);
          let exifIfd: number | null = null;
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (e + 12 > v.byteLength) break;
            const tag = u16(e);
            if (tag === 0x8769) exifIfd = tiff + u32(e + 8);
            if (tag === 0x9003 || tag === 0x0132) {
              const count = u32(e + 4);
              const ptr = count > 4 ? tiff + u32(e + 8) : e + 8;
              if (ptr + count > v.byteLength) continue;
              const str = new TextDecoder().decode(new Uint8Array(bytes, ptr, Math.min(count, 19)));
              const m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
              if (m && tag === 0x9003) return Number(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`));
            }
          }
          return exifIfd;
        };
        const r0 = readIfd(ifd0);
        if (r0 === null) return null;
        if (r0 > 1e12) return new Date(r0);           // wynik = timestamp
        const r1 = readIfd(r0);                       // wskaźnik na Exif IFD
        return r1 !== null && r1 > 1e12 ? new Date(r1) : null;
      }
      if (marker === 0xda) return null; // start of scan — dalej nie ma EXIF
      off += 2 + len;
    }
  } catch { /* brak EXIF */ }
  return null;
}

function boolOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return value === true || value === "true" || value === 1 || value === "1";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
  if (!serviceKey) return json({ ok: false, error: "server_config" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = createClient(url, serviceKey, { db: { schema: "market" } });
  // Powiadomienia in-app + e-mail (market.rental_protocol_event) — nigdy nie blokują odpowiedzi
  async function protocolEvent(bookingId: string, event: string) {
    try { await sb.rpc("rental_protocol_event", { p_booking: bookingId, p_event: event }); } catch (e) { console.warn("rental_protocol_event", event, e); }
  }

  async function getSeller() {
    const { data } = await sb.from("sellers").select("id").eq("auth_user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
    if (!user.email) return null;
    const { data: byEmail } = await sb.from("sellers").select("id").is("auth_user_id", null).ilike("email", user.email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return byEmail?.id as string | undefined ?? null;
  }

  async function bookingAccess(bookingId: string) {
    const sellerId = await getSeller();
    const { data: booking } = await sb.from("bookings").select("id,seller_id,buyer_id,resource_id,booking_type,status,deposit_gross,deposit_status,starts_at,ends_at").eq("id", bookingId).maybeSingle();
    if (!booking) return { booking: null, sellerId, seller: false, buyer: false, resourceKind: null as string | null };
    let resourceKind: string | null = null;
    if (booking.resource_id) {
      const { data: resource } = await sb.from("booking_resources").select("kind").eq("id", booking.resource_id).maybeSingle();
      resourceKind = (resource?.kind as string | undefined) ?? null;
    }
    return { booking, sellerId, seller: !!sellerId && booking.seller_id === sellerId, buyer: booking.buyer_id === user.id, resourceKind };
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let action = "get";
    let bookingId = "";
    let phase = "handover";
    let photoId = "";
    let payload: Record<string, unknown> = {};
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = String(form.get("action") ?? "upload_photo");
      bookingId = String(form.get("booking_id") ?? "");
      phase = String(form.get("phase") ?? "handover");
      const candidate = form.get("file");
      file = candidate instanceof File ? candidate : null;
      payload = { capture_source: form.get("capture_source"), lat: form.get("lat"), lon: form.get("lon"), client_time: form.get("client_time") };
    } else {
      const body = await req.json().catch(() => ({}));
      action = String(body?.action ?? "get");
      bookingId = String(body?.booking_id ?? "");
      phase = String(body?.phase ?? "handover");
      photoId = String(body?.photo_id ?? "");
      payload = (body?.payload && typeof body.payload === "object") ? body.payload as Record<string, unknown> : {};
    }

    if (!bookingId) return json({ ok: false, error: "missing_booking" }, 400);
    const access = await bookingAccess(bookingId);
    if (!access.booking || (!access.seller && !access.buyer)) return json({ ok: false, error: "forbidden" }, 403);

    // Zdjęcia protokołu — sprzedawca i klient, tylko „teraz” (pieczęć czasu serwera + sha256 + EXIF + okno rezerwacji)
    function photoWindows() {
      const start = Number(new Date(access.booking!.starts_at));
      const end = Number(new Date(access.booking!.ends_at));
      return {
        handover: { from: new Date(start - HANDOVER_WINDOW_BEFORE_MS).toISOString(), to: new Date(end).toISOString() },
        return: { from: new Date(start).toISOString(), to: new Date(end + RETURN_WINDOW_AFTER_MS).toISOString() },
      };
    }

    if (action === "get") {
      const selectFields = access.seller ? "*" : BUYER_FIELDS;
      const { data: protocol, error: protocolError } = await sb.from("booking_handover_protocols").select(selectFields).eq("booking_id", bookingId).maybeSingle();
      if (protocolError) throw protocolError;
      if (protocol && !protocol.resource_kind && access.resourceKind) protocol.resource_kind = access.resourceKind;
      const { data: photos, error: photosError } = await sb.from("booking_protocol_photos").select(PHOTO_FIELDS).eq("booking_id", bookingId).order("created_at");
      if (photosError) throw photosError;
      return json({ ok: true, protocol: protocol ?? null, photos: photos ?? [], can_edit: access.seller, can_respond: access.buyer, server_time: new Date().toISOString(), windows: photoWindows() });
    }

    if (action === "photo_url") {
      if (!photoId) return json({ ok: false, error: "missing_photo" }, 400);
      const { data: photo, error } = await sb.from("booking_protocol_photos").select("id,booking_id,storage_path").eq("id", photoId).eq("booking_id", bookingId).maybeSingle();
      if (error) throw error;
      if (!photo) return json({ ok: false, error: "not_found" }, 404);
      const { data: signed, error: signedError } = await sb.storage.from(BUCKET).createSignedUrl(photo.storage_path, 120);
      if (signedError) throw signedError;
      return json({ ok: true, url: signed.signedUrl, expires_in: 120 });
    }

    if (action === "buyer_respond") {
      if (!access.buyer) return json({ ok: false, error: "buyer_only" }, 403);
      if (access.booking.booking_type !== "daily") return json({ ok: false, error: "rental_only" }, 400);
      if (!["handover", "return"].includes(phase)) return json({ ok: false, error: "invalid_phase" }, 400);
      const response = String(payload.status ?? "");
      if (!["acknowledged", "disputed"].includes(response)) return json({ ok: false, error: "invalid_response" }, 400);
      const note = String(payload.note ?? "").trim().slice(0, 2000);
      if (response === "disputed" && note.length < 3) return json({ ok: false, error: "dispute_note_required" }, 400);

      const { data: protocol, error: protocolError } = await sb.from("booking_handover_protocols").select("id,handover_at,return_at,handover_buyer_status,return_buyer_status").eq("booking_id", bookingId).maybeSingle();
      if (protocolError) throw protocolError;
      if (!protocol) return json({ ok: false, error: "protocol_not_ready" }, 409);
      const phaseAt = phase === "handover" ? protocol.handover_at : protocol.return_at;
      const current = phase === "handover" ? protocol.handover_buyer_status : protocol.return_buyer_status;
      if (!phaseAt) return json({ ok: false, error: "phase_not_ready" }, 409);
      if (current !== "pending") return json({ ok: false, error: "already_responded" }, 409);

      const now = new Date().toISOString();
      const patch = phase === "handover" ? {
        handover_buyer_status: response,
        handover_buyer_responded_at: now,
        handover_buyer_responded_by: user.id,
        handover_buyer_note: note || null,
        updated_at: now,
      } : {
        return_buyer_status: response,
        return_buyer_responded_at: now,
        return_buyer_responded_by: user.id,
        return_buyer_note: note || null,
        updated_at: now,
      };
      const { data, error } = await sb.from("booking_handover_protocols").update(patch).eq("id", protocol.id).select(BUYER_FIELDS).single();
      if (error) throw error;
      if (data && !data.resource_kind && access.resourceKind) data.resource_kind = access.resourceKind;
      await protocolEvent(bookingId, `${phase}_${response === "acknowledged" ? "ack" : "dispute"}`);
      return json({ ok: true, protocol: data });
    }

    if (action === "upload_photo") {
      if (!file) return json({ ok: false, error: "missing_file" }, 400);
      if (!ALLOWED.has(file.type)) return json({ ok: false, error: "invalid_file_type" }, 400);
      if (file.size > MAX_BYTES) return json({ ok: false, error: "file_too_large" }, 400);
      if (!["handover", "return"].includes(phase)) return json({ ok: false, error: "invalid_phase" }, 400);
      if (access.booking.booking_type !== "daily") return json({ ok: false, error: "rental_only" }, 400);
      const now = Date.now();
      const win = photoWindows()[phase as "handover" | "return"];
      if (now < Number(new Date(win.from)) || now > Number(new Date(win.to))) return json({ ok: false, error: "outside_window", window: win }, 409);
      const bytes = await file.arrayBuffer();
      const taken = exifTakenAt(bytes);
      if (taken && now - Number(taken) > PHOTO_MAX_AGE_MS) return json({ ok: false, error: "photo_too_old", taken_at: taken.toISOString() }, 409);
      if (taken && Number(taken) - now > PHOTO_MAX_AGE_MS) return json({ ok: false, error: "photo_clock_ahead", taken_at: taken.toISOString() }, 409);
      const role = access.seller ? "seller" : "buyer";
      const { data: existingProtocol } = await sb.from("booking_handover_protocols").select("id,status,handover_buyer_status,return_buyer_status").eq("booking_id", bookingId).maybeSingle();
      let protocol = existingProtocol as Record<string, unknown> | null;
      if (!protocol) {
        const { data: created, error } = await sb.from("booking_handover_protocols").insert({
          booking_id: bookingId, seller_id: access.booking.seller_id, buyer_id: access.booking.buyer_id,
          resource_id: access.booking.resource_id, resource_kind: access.resourceKind, created_by: user.id, updated_by: user.id,
        }).select("id,status,handover_buyer_status,return_buyer_status").single();
        if (error) throw error;
        protocol = created as Record<string, unknown>;
      }
      const ackField = phase === "handover" ? "handover_buyer_status" : "return_buyer_status";
      if (String(protocol[ackField] ?? "pending") === "acknowledged") return json({ ok: false, error: "buyer_confirmed_locked" }, 409);
      const id = crypto.randomUUID();
      const ext = (safeName(file.name).split(".").pop() || "jpg").toLowerCase();
      const path = `${access.booking.seller_id}/${bookingId}/${phase}/${role}-${id}.${ext}`;
      const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const clientTime = Number(new Date(String(payload.client_time ?? "")));
      const lat = numOrNull(payload.lat), lon = numOrNull(payload.lon);
      const { data, error } = await sb.from("booking_protocol_photos").insert({
        id, protocol_id: protocol.id, booking_id: bookingId, phase, storage_path: path,
        file_name: safeName(file.name), mime_type: file.type, created_by: user.id,
        sha256: await sha256Hex(bytes), size_bytes: file.size, exif_taken_at: taken ? taken.toISOString() : null,
        capture_source: String(payload.capture_source ?? "") === "camera" ? "camera" : "file", uploaded_role: role,
        lat: lat != null && Math.abs(lat) <= 90 ? lat : null, lon: lon != null && Math.abs(lon) <= 180 ? lon : null,
        client_time_skew_s: Number.isFinite(clientTime) ? Math.round((clientTime - now) / 1000) : null,
      }).select(PHOTO_FIELDS).single();
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw error; }
      if (role === "buyer") await protocolEvent(bookingId, `buyer_photos_${phase}`);
      return json({ ok: true, photo: data });
    }

    if (!access.seller) return json({ ok: false, error: "seller_only" }, 403);

    async function ensureProtocol() {
      const { data: existing } = await sb.from("booking_handover_protocols").select("*").eq("booking_id", bookingId).maybeSingle();
      if (existing) return existing;
      const { data: created, error } = await sb.from("booking_handover_protocols").insert({
        booking_id: bookingId,
        seller_id: access.booking!.seller_id,
        buyer_id: access.booking!.buyer_id,
        resource_id: access.booking!.resource_id,
        resource_kind: access.resourceKind,
        created_by: user.id,
        updated_by: user.id,
      }).select("*").single();
      if (error) throw error;
      return created;
    }

    async function prepareSellerRevision(protocol: Record<string, unknown>, revisionPhase: "handover" | "return") {
      const statusField = revisionPhase === "handover" ? "handover_buyer_status" : "return_buyer_status";
      const respondedByField = revisionPhase === "handover" ? "handover_buyer_responded_by" : "return_buyer_responded_by";
      const current = String(protocol[statusField] ?? "pending");
      if (current === "acknowledged") return false;
      if (current === "disputed") {
        const { error } = await sb.from("booking_handover_protocols").update({
          [statusField]: "pending",
          [respondedByField]: null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq("id", String(protocol.id));
        if (error) throw error;
        protocol[statusField] = "pending";
      }
      return true;
    }

    if (action === "save_handover" || action === "save_return") {
      const protocol = await ensureProtocol();
      const isHandover = action === "save_handover";
      const revisionPhase = isHandover ? "handover" : "return";
      if (!await prepareSellerRevision(protocol, revisionPhase)) return json({ ok: false, error: "buyer_confirmed_locked" }, 409);
      const { count: photoCount } = await sb.from("booking_protocol_photos").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("phase", revisionPhase);
      if (!photoCount) return json({ ok: false, error: "photos_required" }, 409);
      const patch: Record<string, unknown> = {
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        resource_kind: protocol.resource_kind ?? access.resourceKind,
      };
      if (isHandover) {
        patch.status = protocol.status === "draft" ? "issued" : protocol.status;
        patch.handover_at = protocol.handover_at ?? new Date().toISOString(); // czas ustawia serwer, nie formularz
        patch.handover_odometer = numOrNull(payload.handover_odometer);
        patch.handover_fuel_percent = numOrNull(payload.handover_fuel_percent);
        patch.handover_condition = String(payload.handover_condition ?? "").slice(0, 4000) || null;
        patch.handover_notes = String(payload.handover_notes ?? "").slice(0, 4000) || null;
        patch.handover_kit_complete = boolOrNull(payload.handover_kit_complete);
      } else {
        patch.status = "returned";
        patch.return_at = protocol.return_at ?? new Date().toISOString(); // czas ustawia serwer, nie formularz
        patch.return_odometer = numOrNull(payload.return_odometer);
        patch.return_fuel_percent = numOrNull(payload.return_fuel_percent);
        patch.return_condition = String(payload.return_condition ?? "").slice(0, 4000) || null;
        patch.return_notes = String(payload.return_notes ?? "").slice(0, 4000) || null;
        patch.return_kit_complete = boolOrNull(payload.return_kit_complete);
        patch.damage_found = Boolean(payload.damage_found);
        patch.damage_note = String(payload.damage_note ?? "").slice(0, 4000) || null;
      }
      const { data, error } = await sb.from("booking_handover_protocols").update(patch).eq("id", protocol.id).select("*").single();
      if (error) throw error;
      if (!isHandover && access.booking.status === "confirmed") {
        // zwrot zapisany → najem zakończony (serwer, nie klient)
        await sb.from("bookings").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", bookingId).eq("status", "confirmed");
      }
      await protocolEvent(bookingId, isHandover ? "handover_saved" : "return_saved");
      return json({ ok: true, protocol: data });
    }

    // „Podpis kodem”: sprzedawca prosi o kod → klient dostaje 6 cyfr (in-app + e-mail) → sprzedawca wpisuje kod
    if (action === "issue_code" || action === "verify_code") {
      if (access.booking.booking_type !== "daily") return json({ ok: false, error: "rental_only" }, 400);
      if (!["handover", "return"].includes(phase)) return json({ ok: false, error: "invalid_phase" }, 400);
      await ensureProtocol();
      if (action === "issue_code") {
        const { error } = await sb.rpc("issue_handover_code", { p_booking: bookingId, p_phase: phase });
        if (error) throw error;
        return json({ ok: true, issued: true });
      }
      const { data: result, error } = await sb.rpc("verify_handover_code", { p_booking: bookingId, p_phase: phase, p_code: String(payload.code ?? "") });
      if (error) throw error;
      if (result !== "ok") return json({ ok: false, error: `code_${result}` }, 409);
      return json({ ok: true, verified: true });
    }

    if (action === "save_deposit_decision") {
      const protocol = await ensureProtocol();
      const decision = String(payload.deposit_decision ?? "pending");
      if (!["pending", "refund", "partial", "retain"].includes(decision)) return json({ ok: false, error: "invalid_decision" }, 400);
      const requested = numOrNull(payload.deposit_retained_requested_gross) ?? 0;
      const deposit = Number(access.booking.deposit_gross ?? 0);
      if (requested < 0 || requested > deposit) return json({ ok: false, error: "invalid_amount" }, 400);
      const { data, error } = await sb.from("booking_handover_protocols").update({
        deposit_decision: decision,
        deposit_retained_requested_gross: requested,
        deposit_decision_note: String(payload.deposit_decision_note ?? "").slice(0, 4000) || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq("id", protocol.id).select("*").single();
      if (error) throw error;
      return json({ ok: true, protocol: data });
    }

    if (action === "delete_photo") {
      if (!photoId) return json({ ok: false, error: "missing_photo" }, 400);
      const { data: photo, error } = await sb.from("booking_protocol_photos").select("id,booking_id,storage_path,phase,uploaded_role").eq("id", photoId).eq("booking_id", bookingId).maybeSingle();
      if (error) throw error;
      if (!photo) return json({ ok: true });
      if (photo.uploaded_role !== "seller") return json({ ok: false, error: "buyer_photo_locked" }, 409);
      const protocol = await ensureProtocol();
      if (!await prepareSellerRevision(protocol, photo.phase as "handover" | "return")) return json({ ok: false, error: "buyer_confirmed_locked" }, 409);
      await sb.storage.from(BUCKET).remove([photo.storage_path]);
      const { error: deleteError } = await sb.from("booking_protocol_photos").delete().eq("id", photoId);
      if (deleteError) throw deleteError;
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (error) {
    return json({ ok: false, error: String((error as Error).message ?? error) }, 400);
  }
});
