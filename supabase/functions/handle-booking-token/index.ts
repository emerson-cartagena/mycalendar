import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const body = await req.json();
    const { token, action, reason } = body;

    if (!token || !action) {
      return new Response(
        JSON.stringify({ error: "Missing token or action" }),
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Buscar token válido y no utilizado
    const { data: tokenData, error: tokenError } = await supabase
      .from("booking_tokens")
      .select("*, booking_id")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid, expired, or already used token",
          success: false 
        }),
        { status: 401 }
      );
    }

    // Verificar que el action_type coincida
    if (tokenData.action_type !== action) {
      return new Response(
        JSON.stringify({ 
          error: "Token action type does not match",
          success: false 
        }),
        { status: 400 }
      );
    }

    // Obtener la reserva
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", tokenData.booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { status: 404 }
      );
    }

    // Procesar acción
    if (action === "cancel") {
      // Cancelar la reserva
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_reason: reason || "Cancelado por el cliente",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (updateError) throw updateError;

      // Marcar token como usado
      await supabase
        .from("booking_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Booking cancelled successfully",
          booking_id: booking.id 
        }),
        { status: 200 }
      );
    }

    if (action === "reschedule") {
      // Para reschedule, retornar datos para que el frontend maneje
      // (el usuario necesita seleccionar la nueva fecha)
      return new Response(
        JSON.stringify({
          success: true,
          booking_id: booking.id,
          event_id: booking.event_id,
          old_slot: booking.slot_datetime,
          attendee_name: booking.attendee_name,
          attendee_email: booking.attendee_email,
          message: "Booking ready to reschedule",
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400 }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500 }
    );
  }
});
