// Edge Function: Handle booking token for cancellation or rescheduling
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const body = await req.json();
    const { token, action, reason } = body;

    console.log("Received request:", { token: token ? token.substring(0, 10) + "..." : "missing", action, reason });

    if (!token || !action) {
      console.error("Missing required fields:", { token: !!token, action: !!action });
      return new Response(
        JSON.stringify({ error: "Missing token or action" }),
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Buscar token válido y no utilizado
    console.log("Searching for token in database...");
    const { data: tokenData, error: tokenError } = await supabase
      .from("booking_tokens")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    console.log("Token search result:", { 
      found: !!tokenData, 
      error: tokenError?.message,
      tokenFound: tokenData ? {
        booking_id: tokenData.booking_id,
        action_type: tokenData.action_type,
        expires_at: tokenData.expires_at,
        used_at: tokenData.used_at
      } : null
    });

    if (tokenError || !tokenData) {
      console.error("Token validation failed:", { 
        error: tokenError?.message,
        hasData: !!tokenData
      });
      return new Response(
        JSON.stringify({ 
          error: "Invalid, expired, or already used token",
          details: tokenError?.message || "Token not found or already used",
          success: false 
        }),
        { 
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Verificar que el action_type coincida
    console.log("Checking action type match:", { 
      tokenAction: tokenData.action_type, 
      requestAction: action,
      match: tokenData.action_type === action
    });

    if (tokenData.action_type !== action) {
      console.error("Action type mismatch");
      return new Response(
        JSON.stringify({ 
          error: "Token action type does not match",
          expected: tokenData.action_type,
          received: action,
          success: false 
        }),
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Obtener la reserva
    console.log("Fetching booking:", { booking_id: tokenData.booking_id });
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", tokenData.booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", { 
        booking_id: tokenData.booking_id, 
        error: bookingError?.message 
      });
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        { 
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log("Booking found:", { 
      id: booking.id, 
      attendee: booking.attendee_name,
      status: booking.status
    });

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

      // Enviar notificaciones de cancelación
      try {
        // Obtener evento e información del owner
        const { data: eventData } = await supabase
          .from("events")
          .select("user_id, title, location_url")
          .eq("id", booking.event_id)
          .single();

        if (eventData) {
          const { data: ownerData } = await supabase
            .from("users")
            .select("email")
            .eq("id", eventData.user_id)
            .single();

          if (ownerData && RESEND_API_KEY) {
            // Notificar al owner (sin botones)
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "My Calendar <noreply@mycalendar.pro>",
                to: ownerData.email,
                subject: `Cancelación de Reserva - ${eventData.title}`,
                html: `
                  <!DOCTYPE html>
                  <html>
                  <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                      <h2 style="color: #dc3545; margin-bottom: 24px;">Cancelación de Reserva</h2>
                      <p>La reserva de <strong>${booking.attendee_name}</strong> para <strong>${eventData.title}</strong> ha sido cancelada.</p>
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
                        <p style="margin: 8px 0;"><strong>Asistente:</strong> ${booking.attendee_name}</p>
                        <p style="margin: 8px 0;"><strong>Email:</strong> ${booking.attendee_email}</p>
                        <p style="margin: 8px 0;"><strong>Fecha/Hora:</strong> ${booking.slot_datetime}</p>
                      </div>
                      <p style="margin-top: 24px; color: #999; font-size: 12px;">
                        © 2026 MyCalendar. Todos los derechos reservados.
                      </p>
                    </div>
                  </body>
                  </html>
                `,
              }),
            });

            // Notificar a los invitados (sin botones)
            if (booking.extra_guests && booking.extra_guests.length > 0) {
              for (const guestEmail of booking.extra_guests) {
                fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${RESEND_API_KEY}`,
                  },
                  body: JSON.stringify({
                    from: "My Calendar <noreply@mycalendar.pro>",
                    to: guestEmail,
                    subject: `Cancelación de Reunión - ${eventData.title}`,
                    html: `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      </head>
                      <body style="font-family: Arial, sans-serif; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #dc3545; margin-bottom: 24px;">Cancelación de Reunión</h2>
                          <p>Hola,</p>
                          <p>La reunión <strong>${eventData.title}</strong> ha sido cancelada.</p>
                          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
                          </div>
                          <p style="margin-top: 32px; color: #666; font-size: 13px;">
                            Si tienes preguntas, contacta con el organizador.
                          </p>
                          <p style="margin-top: 24px; color: #999; font-size: 12px;">
                            © 2026 MyCalendar. Todos los derechos reservados.
                          </p>
                        </div>
                      </body>
                      </html>
                    `,
                  }),
                }).catch(err => console.error("Error sending guest cancel email:", err));
              }
            }
          }
        }
      } catch (emailError) {
        console.error("Error sending cancellation emails:", emailError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Booking cancelled successfully",
          booking: booking,
          booking_id: booking.id 
        }),
        { 
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    if (action === "reschedule") {
      // Para reschedule, marcar token como usado y retornar datos para que el frontend maneje
      console.log("Processing reschedule action");
      
      // Marcar token como usado
      const { error: updateTokenError } = await supabase
        .from("booking_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);

      if (updateTokenError) {
        console.error("Error marking token as used:", updateTokenError);
      } else {
        console.log("✓ Token marked as used for reschedule");
      }

      // (el usuario necesita seleccionar la nueva fecha)
      console.log("Returning booking data for reschedule");
      return new Response(
        JSON.stringify({
          success: true,
          booking: booking,
          booking_id: booking.id,
          event_id: booking.event_id,
          old_slot: booking.slot_datetime,
          attendee_name: booking.attendee_name,
          attendee_email: booking.attendee_email,
          extra_guests: booking.extra_guests,
          message: "Booking ready to reschedule",
        }),
        { 
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { 
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error processing request:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : ""
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
