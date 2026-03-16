import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

interface RequestBody {
  ownerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  bookingId: string;
  slot: string;
  locationUrl?: string;
  type?: "booking" | "reschedule" | "cancel";
  reason?: string;
  oldSlot?: string;
  newSlot?: string;
  extraGuests?: string[];
  originatedFrom?: "attendee" | "owner";
}

// Generar token seguro
function generateSecureToken(): string {
  return crypto.getRandomValues(new Uint8Array(32)).reduce(
    (acc, byte) => acc + byte.toString(16).padStart(2, "0"),
    ""
  );
}

// Generar HTML profesional
function getEmailTemplate(
  type: string,
  data: {
    attendeeName: string;
    eventTitle: string;
    formattedSlot: string;
    locationUrl?: string;
    cancelLink?: string;
    rescheduleLink?: string;
    oldSlot?: string;
    newSlot?: string;
    reason?: string;
  }
): string {
  const baseStyles = `
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.6;
    color: #333;
  `;

  const buttonStyle = `
    display: inline-block;
    padding: 12px 24px;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
    margin-right: 12px;
    margin-top: 16px;
    font-size: 14px;
  `;

  if (type === "booking") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2c3e50; margin-bottom: 24px;">✓ Confirmación de Reserva</h2>
    
    <p>Hola <strong>${data.attendeeName}</strong>,</p>
    
    <p>Tu reserva ha sido confirmada para <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>📅 Fecha y Hora:</strong> ${data.formattedSlot}</p>
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>🔗 Enlace de Reunión:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
    </div>
    
    <p><strong>Acciones:</strong></p>
    <div style="margin: 24px 0;">
      <a href="${data.cancelLink}" style="${buttonStyle} background-color: #dc3545; color: white;">Cancelar Reserva</a>
      <a href="${data.rescheduleLink}" style="${buttonStyle} background-color: #ffc107; color: #333;">Reprogramar</a>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si tienes preguntas, responde este correo o contacta al organizador.<br>
      Estos enlaces expiran en 30 días.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "reschedule") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2c3e50; margin-bottom: 24px;">📅 Reserva Reprogramada</h2>
    
    <p>Hola <strong>${data.attendeeName}</strong>,</p>
    
    <p>Tu reserva para <strong>${data.eventTitle}</strong> ha sido reprogramada.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0; color: #666;"><strong>Fecha Anterior:</strong> ${data.oldSlot}</p>
      <p style="margin: 8px 0; color: #27ae60;"><strong>✓ Nueva Fecha:</strong> ${data.newSlot}</p>
      ${data.reason ? `<p style="margin: 8px 0;"><strong>Motivo:</strong> ${data.reason}</p>` : ""}
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>🔗 Enlace:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si necesitas otra fecha, <a href="${data.rescheduleLink}" style="color: #0066cc;">puedes reprogramar nuevamente aquí</a>.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "cancel") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #dc3545; margin-bottom: 24px;">❌ Reserva Cancelada</h2>
    
    <p>Hola <strong>${data.attendeeName}</strong>,</p>
    
    <p>Tu reserva para <strong>${data.eventTitle}</strong> ha sido cancelada.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Fecha:</strong> ${data.formattedSlot}</p>
      ${data.reason ? `<p style="margin: 8px 0;"><strong>Motivo:</strong> ${data.reason}</p>` : ""}
    </div>
    
    <p>Si deseas hacer una nueva reserva, <a href="https://mycalendar.pro" style="color: #0066cc;">visita nuestro sitio</a>.</p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "guest-notification") {
    // Email para invitados adicionales (sin botones de acción)
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2c3e50; margin-bottom: 24px;">📅 Te han Invitado a una Reunión</h2>
    
    <p>Hola <strong>${data.attendeeName}</strong>,</p>
    
    <p>Has sido invitado a una reunión para <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>📅 Fecha y Hora:</strong> ${data.formattedSlot}</p>
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>🔗 Enlace de Reunión:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si tienes preguntas sobre esta reunión, contáctate con el organizador.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  }

  return "";
}

serve(async (req: Request) => {
  // Manejar CORS preflight
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
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: RequestBody = await req.json();
    console.log("Received request body:", body);

    const {
      ownerEmail,
      attendeeName,
      attendeeEmail,
      eventTitle,
      bookingId,
      slot,
      locationUrl,
      type = "booking",
      reason = "",
      oldSlot = "",
      newSlot = "",
      extraGuests = [],
      originatedFrom,
    } = body;

    if (!ownerEmail || !attendeeName || !attendeeEmail || !eventTitle || !bookingId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    }

    const slotDate = new Date(slot);
    const formattedSlot = slotDate.toLocaleDateString("es-SV", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Generar tokens seguros si es booking o owner reschedule
    let cancelLink = "";
    let rescheduleLink = "";
    
    if (type === "booking" || (originatedFrom === "owner" && type === "reschedule")) {
      // Crear tokens en la BD
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      
      const cancelToken = generateSecureToken();
      const rescheduleToken = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      console.log("Generating tokens for booking:", { bookingId, cancelToken: cancelToken.substring(0, 10) + "..." });

      // Guardar tokens con error handling
      try {
        const [cancelResult, rescheduleResult] = await Promise.all([
          supabase.from("booking_tokens").insert({
            booking_id: bookingId,
            token: cancelToken,
            action_type: "cancel",
            expires_at: expiresAt.toISOString(),
          }),
          supabase.from("booking_tokens").insert({
            booking_id: bookingId,
            token: rescheduleToken,
            action_type: "reschedule",
            expires_at: expiresAt.toISOString(),
          }),
        ]);

        if (cancelResult.error) {
          console.error("Error saving cancel token:", cancelResult.error);
        } else {
          console.log("✓ Cancel token saved successfully");
        }

        if (rescheduleResult.error) {
          console.error("Error saving reschedule token:", rescheduleResult.error);
        } else {
          console.log("✓ Reschedule token saved successfully");
        }

        cancelLink = `https://mycalendar.pro/booking-action?token=${cancelToken}&action=cancel`;
        rescheduleLink = `https://mycalendar.pro/booking-action?token=${rescheduleToken}&action=reschedule`;
        console.log("✓ Token links generated:", { cancelLink: cancelLink.substring(0, 50) + "...", rescheduleLink: rescheduleLink.substring(0, 50) + "..." });
      } catch (tokenError) {
        console.error("Error during token generation/insertion:", tokenError);
        return new Response(
          JSON.stringify({ error: `Failed to generate tokens: ${tokenError}` }),
          { 
            status: 500, 
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        );
      }
    }

    const attendeeEmailContent = getEmailTemplate(type, {
      attendeeName,
      eventTitle,
      formattedSlot,
      locationUrl,
      cancelLink,
      rescheduleLink,
      oldSlot,
      newSlot,
      reason,
    });

    // Si originatedFrom === 'attendee' y type === 'reschedule', enviar a owner y guests
    // en lugar de al attendee
    if (originatedFrom === "attendee" && type === "reschedule") {
      console.log("Attendee-initiated reschedule: sending to owner and guests");

      // Generar tokens para que el owner pueda cancelar o reprogramar nuevamente
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const cancelToken = generateSecureToken();
      const rescheduleToken = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      try {
        const [cancelResult, rescheduleResult] = await Promise.all([
          supabase.from("booking_tokens").insert({
            booking_id: bookingId,
            token: cancelToken,
            action_type: "cancel",
            expires_at: expiresAt.toISOString(),
          }),
          supabase.from("booking_tokens").insert({
            booking_id: bookingId,
            token: rescheduleToken,
            action_type: "reschedule",
            expires_at: expiresAt.toISOString(),
          }),
        ]);

        if (cancelResult.error || rescheduleResult.error) {
          console.error("Error saving owner tokens:", { cancelResult, rescheduleResult });
        }

        const ownerCancelLink = `https://mycalendar.pro/booking-action?token=${cancelToken}&action=cancel`;
        const ownerRescheduleLink = `https://mycalendar.pro/booking-action?token=${rescheduleToken}&action=reschedule`;

        // Email para el owner CON botones
        const ownerEmailContent = getEmailTemplate("reschedule", {
          attendeeName: `${attendeeName} (${attendeeEmail})`,
          eventTitle,
          formattedSlot: newSlot || slot,
          locationUrl,
          cancelLink: ownerCancelLink,
          rescheduleLink: ownerRescheduleLink,
          oldSlot,
          newSlot: newSlot || slot,
          reason: `${attendeeName} ha reprogramado la reserva`,
        });

        // Enviar al owner
        const ownerEmailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "My Calendar <noreply@mycalendar.pro>",
            to: ownerEmail,
            subject: `Reserva Reprogramada - ${eventTitle}`,
            html: ownerEmailContent,
          }),
        });

        if (!ownerEmailResponse.ok) {
          const error = await ownerEmailResponse.text();
          console.error(`Failed to send email to owner: ${error}`);
        } else {
          console.log("✓ Email sent to owner successfully");
        }

        // Enviar notificación a invitados SIN botones
        if (extraGuests && extraGuests.length > 0) {
          console.log(`Sending reschedule guest notifications to ${extraGuests.length} guests`);

          for (const guestEmail of extraGuests) {
            try {
              const guestEmailContent = getEmailTemplate("guest-notification", {
                attendeeName: attendeeName,
                eventTitle,
                formattedSlot: newSlot || slot,
                locationUrl,
              });

              const guestResponse = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                  from: "My Calendar <noreply@mycalendar.pro>",
                  to: guestEmail,
                  subject: `Cambio de horario - ${eventTitle}`,
                  html: guestEmailContent,
                }),
              });

              if (guestResponse.ok) {
                console.log(`✓ Reschedule notification sent to guest ${guestEmail}`);
              } else {
                const error = await guestResponse.text();
                console.error(`✗ Failed to send reschedule notification to ${guestEmail}: ${error}`);
              }
            } catch (guestError) {
              console.error(`Error sending reschedule notification to ${guestEmail}:`, guestError);
            }
          }
        }
      } catch (tokenError) {
        console.error("Error during token generation for owner:", tokenError);
      }
    } else if (originatedFrom === "owner" && (type === "cancel" || type === "reschedule")) {
      console.log(`Owner-initiated ${type}: sending to attendee and guests`);

      // Email al attendee (con o sin botones según el tipo)
      const attendeeEmailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `${type === "cancel" ? "Reserva Cancelada" : "Reserva Reprogramada"} - ${eventTitle}`,
          html: attendeeEmailContent,
        }),
      });

      if (!attendeeEmailResponse.ok) {
        const error = await attendeeEmailResponse.text();
        console.error(`Failed to send ${type} email to attendee: ${error}`);
      } else {
        console.log(`✓ ${type} email sent to attendee successfully`);
      }

      // Enviar notificación a invitados SIN botones
      if (extraGuests && extraGuests.length > 0) {
        console.log(`Sending ${type} notifications to ${extraGuests.length} guests`);

        for (const guestEmail of extraGuests) {
          try {
            const guestEmailContent = getEmailTemplate("guest-notification", {
              attendeeName: attendeeName,
              eventTitle,
              formattedSlot: type === "cancel" ? slot : newSlot || slot,
              locationUrl,
            });

            const guestResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `${type === "cancel" ? "Reunión Cancelada" : "Cambio de Horario"} - ${eventTitle}`,
                html: guestEmailContent,
              }),
            });

            if (guestResponse.ok) {
              console.log(`✓ ${type} guest notification sent to ${guestEmail}`);
            } else {
              const error = await guestResponse.text();
              console.error(`✗ Failed to send ${type} notification to ${guestEmail}: ${error}`);
            }
          } catch (guestError) {
            console.error(`Error sending ${type} notification to ${guestEmail}:`, guestError);
          }
        }
      }
    } else {
      // Caso por defecto: enviar al attendee (nuevo booking, reschedule sin originatedFrom, cancel sin originatedFrom)
      console.log("Default flow: sending to attendee, owner, and guests");
      
      const attendeeEmailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `${type === "booking" ? "Confirmación de Reserva" : type === "reschedule" ? "Reserva Reprogramada" : "Reserva Cancelada"} - ${eventTitle}`,
          html: attendeeEmailContent,
        }),
      });

      if (!attendeeEmailResponse.ok) {
        const error = await attendeeEmailResponse.text();
        console.error(`Failed to send attendee email: ${error}`);
      } else {
        console.log("✓ Email sent to attendee successfully");
      }

      // Enviar notificación al owner SIN botones (para nuevo booking)
      if (type === "booking") {
        console.log(`Sending booking notification to owner: ${ownerEmail}`);
        const ownerNotificationContent = getEmailTemplate("guest-notification", {
          attendeeName: `${attendeeName} (${attendeeEmail})`,
          eventTitle,
          formattedSlot,
          locationUrl,
        });

        const ownerEmailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "My Calendar <noreply@mycalendar.pro>",
            to: ownerEmail,
            subject: `Nueva Reserva - ${eventTitle}`,
            html: ownerNotificationContent,
          }),
        });

        if (!ownerEmailResponse.ok) {
          const error = await ownerEmailResponse.text();
          console.error(`Failed to send owner notification: ${error}`);
        } else {
          console.log("✓ Owner notification sent successfully");
        }
      }

      // Enviar emails a invitados adicionales (solo notificación, sin botones)
      if (type === "booking" && extraGuests && extraGuests.length > 0) {
        console.log(`Sending guest notification emails to ${extraGuests.length} invitados`);

        for (const guestEmail of extraGuests) {
          try {
            const guestEmailContent = getEmailTemplate("guest-notification", {
              attendeeName: attendeeName, // Usar el nombre del que hizo la reserva
              eventTitle,
              formattedSlot,
              locationUrl,
            });

            const guestResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "My Calendar <noreply@mycalendar.pro>",
                to: guestEmail,
              subject: `Te han invitado a una reunión - ${eventTitle}`,
                html: guestEmailContent,
              }),
            });

            if (guestResponse.ok) {
              console.log(`✓ Guest notification sent to ${guestEmail}`);
            } else {
              const error = await guestResponse.text();
              console.error(`✗ Failed to send guest email to ${guestEmail}: ${error}`);
            }
          } catch (guestError) {
            console.error(`Error sending guest email to ${guestEmail}:`, guestError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Emails sent successfully" }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    );
  }
});
