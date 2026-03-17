// Edge Function: Send booking confirmation and notification emails
// Version: 2.0.0 - Refactored for single email endpoint, proper token management
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

interface RequestBody {
  ownerEmail: string;
  ownerName?: string;
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
    <h2 style="color: #2c3e50; margin-bottom: 24px;">Confirmación de Reserva</h2>
    
    <p>Hola,</p>
    
    <p>Tu reserva ha sido confirmada para <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Asistente:</strong> ${data.attendeeName}</p>
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>Enlace de Reunión:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
    </div>
    
    <p><strong>Acciones:</strong></p>
    <div style="margin: 24px 0;">
      <a href="${data.rescheduleLink}" style="${buttonStyle} background-color: #ffc107; color: #333;">Reprogramar</a>
      <a href="${data.cancelLink}" style="${buttonStyle} background-color: #dc3545; color: white;">Cancelar Reserva</a>
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
    <h2 style="color: #2c3e50; margin-bottom: 24px;">Cambio de Horario</h2>
    
    <p>Hola,</p>
    
    <p>La reunión <strong>${data.eventTitle}</strong> ha sido reprogramada.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Horario anterior:</strong> ${data.oldSlot}</p>
      <p style="margin: 8px 0; color: #28a745;"><strong>Nuevo horario:</strong> ${data.newSlot}</p>
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>Enlace de Reunión:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
    </div>

    ${data.rescheduleLink && data.cancelLink ? `
    <p><strong>Acciones:</strong></p>
    <div style="margin: 24px 0;">
      <a href="${data.rescheduleLink}" style="${buttonStyle} background-color: #ffc107; color: #333;">Reprogramar</a>
      <a href="${data.cancelLink}" style="${buttonStyle} background-color: #dc3545; color: white;">Cancelar Reunión</a>
    </div>
    ` : ""}
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si tienes preguntas, contacta con el organizador.
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
    <h2 style="color: #dc3545; margin-bottom: 24px;">Reserva Cancelada</h2>
    
    <p>Hola,</p>
    
    <p>La reserva para <strong>${data.eventTitle}</strong> ha sido cancelada.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si tienes preguntas, contacta con el organizador.
    </p>
    
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
    <h2 style="color: #2c3e50; margin-bottom: 24px;">Te han Invitado a una Reunión</h2>
    
    <p>Hola,</p>
    
    <p><strong>${data.attendeeName}</strong> te ha invitado a una reunión para <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
      ${data.locationUrl ? `<p style="margin: 8px 0;"><strong>Enlace de Reunión:</strong> <a href="${data.locationUrl}" style="color: #0066cc;">${data.locationUrl}</a></p>` : ""}
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
  } else if (type === "guest-cancel-notification") {
    // Email para notificar a invitados sobre cancelación
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #dc3545; margin-bottom: 24px;">Cancelación de Reunión</h2>
    
    <p>Hola,</p>
    
    <p>La reunión <strong>${data.eventTitle}</strong> ha sido cancelada.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Si tienes preguntas sobre esta cancelación, contacta con el organizador.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "owner-reschedule-notification") {
    // Email para notificar al owner de reprogramación sin botones
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2c3e50; margin-bottom: 24px;">Cambio de Horario</h2>
    
    <p>Hola,</p>
    
    <p><strong>${data.attendeeName}</strong> ha reprogramado la reunión <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Horario anterior:</strong> ${data.oldSlot}</p>
      <p style="margin: 8px 0; color: #28a745;"><strong>Nuevo horario:</strong> ${data.newSlot}</p>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Gestiona esta reserva desde tu panel de control.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "owner-cancel-notification") {
    // Email para notificar al owner de cancelación sin botones
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #dc3545; margin-bottom: 24px;">Cancelación de Reserva</h2>
    
    <p>Hola,</p>
    
    <p><strong>${data.attendeeName}</strong> ha cancelado la reunión <strong>${data.eventTitle}</strong>.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Gestiona esta reserva desde tu panel de control.
    </p>
    
    <p style="margin-top: 24px; color: #999; font-size: 12px;">
      © 2026 MyCalendar. Todos los derechos reservados.
    </p>
  </div>
</body>
</html>`;
  } else if (type === "owner-booking-notification") {
    // Email para notificar al owner de nueva reserva
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2c3e50; margin-bottom: 24px;">Nueva Reserva</h2>
    
    <p>Hola,</p>
    
    <p><strong>${data.attendeeName}</strong> ha reservado la siguiente reunión:</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 8px 0;"><strong>Evento:</strong> ${data.eventTitle}</p>
      <p style="margin: 8px 0;"><strong>Asistente:</strong> ${data.attendeeName}</p>
      <p style="margin: 8px 0;"><strong>Email:</strong> ${data.locationUrl}</p>
      <p style="margin: 8px 0;"><strong>Fecha y Hora:</strong> ${data.formattedSlot}</p>
    </div>
    
    <p style="margin-top: 32px; color: #666; font-size: 13px;">
      Gestiona esta reserva desde tu panel de control.
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
    console.log("📧 Received email request:", { type: body.type, bookingId: body.bookingId, originatedFrom: body.originatedFrom });

    const {
      ownerEmail,
      ownerName = "Organizador",
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const slotDate = new Date(slot);
    const formattedSlot = slotDate.toLocaleDateString("es-SV", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Formatear oldSlot y newSlot si existen
    let formattedOldSlot = "";
    let formattedNewSlot = "";
    if (oldSlot) {
      const oldSlotDate = new Date(oldSlot);
      formattedOldSlot = oldSlotDate.toLocaleDateString("es-SV", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (newSlot) {
      const newSlotDate = new Date(newSlot);
      formattedNewSlot = newSlotDate.toLocaleDateString("es-SV", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    let cancelLink = "";
    let rescheduleLink = "";

    // RESCHEDULE ORIGINADO DEL ATTENDEE: Invalidar tokens anteriores y generar nuevos
    if (originatedFrom === "attendee" && type === "reschedule") {
      console.log("🔄 Attendee-initiated reschedule: invalidating old tokens and creating new ones");
      
      // Marcar TODOS los tokens anteriores de esta booking como usados
      const { error: invalidateError } = await supabase
        .from("booking_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .is("used_at", null); // Solo los que no estén marcados como usados

      if (invalidateError) {
        console.error("⚠️  Error invalidating previous tokens:", invalidateError);
      } else {
        console.log("✓ Previous tokens invalidated");
      }

      // Generar SOLO 2 nuevos tokens (1 reschedule, 1 cancel)
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
          console.error("❌ Error saving new tokens:", { cancelResult, rescheduleResult });
        } else {
          console.log("✓ New tokens created (1 cancel + 1 reschedule)");
        }

        cancelLink = `https://mycalendar.pro/booking-action?token=${cancelToken}&action=cancel`;
        rescheduleLink = `https://mycalendar.pro/booking-action?token=${rescheduleToken}&action=reschedule`;
      } catch (tokenError) {
        console.error("❌ Error generating new tokens:", tokenError);
      }

      // Enviar correo al ATTENDEE con los botones (puede reprogramar/cancelar nuevamente)
      const attendeeEmailContent = getEmailTemplate("reschedule", {
        attendeeName,
        eventTitle,
        formattedSlot: formattedNewSlot,
        locationUrl,
        cancelLink,
        rescheduleLink,
        oldSlot: formattedOldSlot,
        newSlot: formattedNewSlot,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `Reserva Reprogramada - ${eventTitle}`,
          html: attendeeEmailContent,
        }),
      }).then(res => {
        if (res.ok) {
          console.log("✓ Email sent to attendee");
        } else {
          console.error("❌ Failed to send email to attendee");
        }
      });

      // Enviar notificación al OWNER SIN botones (solo información: quién reprogramó, horarios)
      const ownerNotificationContent = getEmailTemplate("owner-reschedule-notification", {
        attendeeName,
        eventTitle,
        formattedSlot: formattedNewSlot,
        oldSlot: formattedOldSlot,
        newSlot: formattedNewSlot,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: ownerEmail,
          subject: `Reserva Reprogramada - ${eventTitle}`,
          html: ownerNotificationContent,
        }),
      }).then(res => {
        if (res.ok) {
          console.log("✓ Owner notification sent");
        } else {
          console.error("❌ Failed to send owner notification");
        }
      });

      // Enviar notificación a invitados SIN botones
      if (extraGuests && extraGuests.length > 0) {
        for (const guestEmail of extraGuests) {
          const guestEmailContent = getEmailTemplate("guest-notification", {
            attendeeName,
            eventTitle,
            formattedSlot: formattedNewSlot,
            locationUrl,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `Cambio de Horario - ${eventTitle}`,
              html: guestEmailContent,
            }),
          }).then(res => {
            if (res.ok) {
              console.log(`✓ Guest notification sent to ${guestEmail}`);
            }
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Reschedule notifications sent",
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

    // CANCELACIÓN ORIGINADA DEL ATTENDEE
    if (originatedFrom === "attendee" && type === "cancel") {
      console.log("🔴 Attendee-initiated cancellation");

      // Construir el contenido del email de cancelación
      const cancelEmailContent = getEmailTemplate("cancel", {
        attendeeName,
        eventTitle,
        formattedSlot,
        locationUrl,
      });

      // Enviar correo al ATTENDEE
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `Reserva Cancelada - ${eventTitle}`,
          html: cancelEmailContent,
        }),
      }).then(res => {
        if (res.ok) {
          console.log("✓ Cancellation email sent to attendee");
        } else {
          console.error("❌ Failed to send cancellation email to attendee");
        }
      });

      // Enviar notificación al OWNER SIN botones
      const ownerCancelContent = getEmailTemplate("owner-cancel-notification", {
        attendeeName,
        eventTitle,
        formattedSlot,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: ownerEmail,
          subject: `Reserva Cancelada - ${eventTitle}`,
          html: ownerCancelContent,
        }),
      }).then(res => {
        if (res.ok) {
          console.log("✓ Owner cancellation notification sent");
        } else {
          console.error("❌ Failed to send owner cancellation notification");
        }
      });

      // Enviar notificación a invitados
      if (extraGuests && extraGuests.length > 0) {
        for (const guestEmail of extraGuests) {
          const guestCancelContent = getEmailTemplate("guest-cancel-notification", {
            attendeeName,
            eventTitle,
            formattedSlot,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `Cancelación de Reunión - ${eventTitle}`,
              html: guestCancelContent,
            }),
          }).then(res => {
            if (res.ok) {
              console.log(`✓ Cancellation notification sent to ${guestEmail}`);
            }
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Cancellation notifications sent",
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

    // CANCELACIÓN ORIGINADA DEL OWNER
    if (originatedFrom === "owner" && type === "cancel") {
      console.log("🔴 Owner-initiated cancellation");

      // Enviar correo al ATTENDEE
      const cancelEmailContent = getEmailTemplate("cancel", {
        attendeeName,
        eventTitle,
        formattedSlot,
        reason,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `Reserva Cancelada - ${eventTitle}`,
          html: cancelEmailContent,
        }),
      }).then(res => {
        if (res.ok) console.log("✓ Cancellation email sent to attendee");
        else console.error("❌ Failed to send cancellation email to attendee");
      });

      // Enviar notificación a invitados
      if (extraGuests && extraGuests.length > 0) {
        for (const guestEmail of extraGuests) {
          const guestCancelContent = getEmailTemplate("guest-cancel-notification", {
            attendeeName,
            eventTitle,
            formattedSlot,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `Cancelación de Reunión - ${eventTitle}`,
              html: guestCancelContent,
            }),
          }).then(res => {
            if (res.ok) console.log(`✓ Cancellation notification sent to ${guestEmail}`);
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Owner cancellation notifications sent" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // REPROGRAMACIÓN ORIGINADA DEL OWNER
    if (originatedFrom === "owner" && type === "reschedule") {
      console.log("🔄 Owner-initiated reschedule");

      // Generar nuevos tokens para el attendee
      const cancelToken = generateSecureToken();
      const rescheduleToken = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      try {
        await Promise.all([
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

        cancelLink = `https://mycalendar.pro/booking-action?token=${cancelToken}&action=cancel`;
        rescheduleLink = `https://mycalendar.pro/booking-action?token=${rescheduleToken}&action=reschedule`;
        console.log("✓ New tokens created for owner reschedule");
      } catch (tokenError) {
        console.error("❌ Error generating tokens:", tokenError);
      }

      // Enviar correo al ATTENDEE con nuevos botones
      const attendeeRescheduleContent = getEmailTemplate("reschedule", {
        attendeeName,
        eventTitle,
        formattedSlot: formattedNewSlot,
        locationUrl,
        cancelLink,
        rescheduleLink,
        oldSlot: formattedOldSlot,
        newSlot: formattedNewSlot,
        reason,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `Reserva Reprogramada - ${eventTitle}`,
          html: attendeeRescheduleContent,
        }),
      }).then(res => {
        if (res.ok) console.log("✓ Reschedule email sent to attendee");
        else console.error("❌ Failed to send reschedule email to attendee");
      });

      // Enviar a invitados
      if (extraGuests && extraGuests.length > 0) {
        for (const guestEmail of extraGuests) {
          const guestEmailContent = getEmailTemplate("guest-notification", {
            attendeeName,
            eventTitle,
            formattedSlot: formattedNewSlot,
            locationUrl,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `Cambio de Horario - ${eventTitle}`,
              html: guestEmailContent,
            }),
          }).then(res => {
            if (res.ok) console.log(`✓ Guest notification sent to ${guestEmail}`);
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Owner reschedule notifications sent" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // BOOKING: Generar tokens SOLO UNA VEZ
    if (type === "booking") {
      const cancelToken = generateSecureToken();
      const rescheduleToken = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      try {
        await Promise.all([
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

        cancelLink = `https://mycalendar.pro/booking-action?token=${cancelToken}&action=cancel`;
        rescheduleLink = `https://mycalendar.pro/booking-action?token=${rescheduleToken}&action=reschedule`;
        console.log("✓ Tokens generated for new booking");
      } catch (tokenError) {
        console.error("❌ Error generating booking tokens:", tokenError);
      }
    }

    // Construir contenido del email base (para attendee en booking)
    const attendeeEmailContent = getEmailTemplate(type, {
      attendeeName,
      eventTitle,
      formattedSlot,
      locationUrl,
      cancelLink,
      rescheduleLink,
      oldSlot: formattedOldSlot,
      newSlot: formattedNewSlot,
      reason,
    });

    // FLUJO POR DEFECTO: BOOKING INICIAL
    if (type === "booking") {
      // Enviar al attendee
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "My Calendar <noreply@mycalendar.pro>",
          to: attendeeEmail,
          subject: `Confirmación de Reserva - ${eventTitle}`,
          html: attendeeEmailContent,
        }),
      }).then(res => {
        if (res.ok) {
          console.log("✓ Confirmation email sent to attendee");
        }
      });

      // Enviar notificación al owner (sin botones)
      const ownerNotificationContent = getEmailTemplate("owner-booking-notification", {
        attendeeName,
        eventTitle,
        formattedSlot,
        locationUrl: attendeeEmail,
      });

      await fetch("https://api.resend.com/emails", {
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
      }).then(res => {
        if (res.ok) {
          console.log("✓ Owner notification sent");
        }
      });

      // Enviar a invitados
      if (extraGuests && extraGuests.length > 0) {
        for (const guestEmail of extraGuests) {
          const guestEmailContent = getEmailTemplate("guest-notification", {
            attendeeName,
            eventTitle,
            formattedSlot,
            locationUrl,
          });

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "My Calendar <noreply@mycalendar.pro>",
              to: guestEmail,
              subject: `Invitación a Reunión - ${eventTitle}`,
              html: guestEmailContent,
            }),
          }).then(res => {
            if (res.ok) {
              console.log(`✓ Guest invitation sent to ${guestEmail}`);
            }
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email processed successfully" }),
      { 
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("❌ Error processing request:", error);
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
