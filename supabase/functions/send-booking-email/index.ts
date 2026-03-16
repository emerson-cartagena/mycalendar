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

    // Generar tokens seguros si es booking
    let cancelLink = "";
    let rescheduleLink = "";
    
    if (type === "booking") {
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

    // Enviar correo al attendee
    const attendeeEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "noreply@mycalendar.pro",
        to: attendeeEmail,
        subject: `${type === "booking" ? "✓ Confirmación de Reserva" : type === "reschedule" ? "📅 Reserva Reprogramada" : "❌ Reserva Cancelada"} - ${eventTitle}`,
        html: attendeeEmailContent,
      }),
    });

    if (!attendeeEmailResponse.ok) {
      const error = await attendeeEmailResponse.text();
      throw new Error(`Failed to send attendee email: ${error}`);
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
      eventId,
      slot,
      locationUrl,
      type = "booking",
      reason = "",
      oldSlot = "",
      newSlot = "",
    } = body;

    if (!ownerEmail || !attendeeName || !attendeeEmail || !eventTitle) {
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
      console.error("RESEND_API_KEY not configured in Supabase Vault");
      return new Response(
        JSON.stringify({ error: "Email service not configured. Please add RESEND_API_KEY to Supabase Vault." }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    }

    console.log("RESEND_API_KEY is available, length:", RESEND_API_KEY.length);
    console.log("RESEND_API_KEY preview:", RESEND_API_KEY.substring(0, 10) + "...");
    console.log("Email configuration:", { ownerEmail, attendeeName, attendeeEmail, eventTitle, slot, type });

    const slotDate = new Date(slot);
    const formattedSlot = slotDate.toLocaleDateString("es-SV", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let ownerEmailContent = "";
    let attendeeEmailContent = "";

    if (type === "booking") {
      ownerEmailContent = `
        <h2>Nueva Reserva</h2>
        <p><strong>Evento:</strong> ${eventTitle}</p>
        <p><strong>Attendee:</strong> ${attendeeName}</p>
        <p><strong>Email:</strong> ${attendeeEmail}</p>
        <p><strong>Fecha:</strong> ${formattedSlot}</p>
        ${locationUrl ? `<p><strong>Enlace:</strong> <a href="${locationUrl}">${locationUrl}</a></p>` : ""}
      `;

      attendeeEmailContent = `
        <h2>Confirmación de Reserva</h2>
        <p>Hola ${attendeeName},</p>
        <p>Tu reserva ha sido confirmada para <strong>${eventTitle}</strong></p>
        <p><strong>Fecha:</strong> ${formattedSlot}</p>
        ${locationUrl ? `<p><strong>Enlace:</strong> <a href="${locationUrl}">${locationUrl}</a></p>` : ""}
        <p>¡Gracias por reservar!</p>
      `;
    } else if (type === "reschedule") {
      const oldSlotDate = new Date(oldSlot);
      const newSlotDate = new Date(newSlot);
      const formattedOldSlot = oldSlotDate.toLocaleDateString("es-SV", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const formattedNewSlot = newSlotDate.toLocaleDateString("es-SV", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      ownerEmailContent = `
        <h2>Cambio de Reserva</h2>
        <p><strong>Evento:</strong> ${eventTitle}</p>
        <p><strong>Attendee:</strong> ${attendeeName}</p>
        <p><strong>Fecha Anterior:</strong> ${formattedOldSlot}</p>
        <p><strong>Nueva Fecha:</strong> ${formattedNewSlot}</p>
        <p><strong>Razón:</strong> ${reason}</p>
        ${locationUrl ? `<p><strong>Enlace:</strong> <a href="${locationUrl}">${locationUrl}</a></p>` : ""}
      `;

      attendeeEmailContent = `
        <h2>Tu Reserva ha sido Reprogramada</h2>
        <p>Hola ${attendeeName},</p>
        <p>Tu reserva para <strong>${eventTitle}</strong> ha sido reprogramada.</p>
        <p><strong>Fecha Anterior:</strong> ${formattedOldSlot}</p>
        <p><strong>Nueva Fecha:</strong> ${formattedNewSlot}</p>
        <p><strong>Razón:</strong> ${reason}</p>
        ${locationUrl ? `<p><strong>Enlace:</strong> <a href="${locationUrl}">${locationUrl}</a></p>` : ""}
      `;
    } else if (type === "cancel") {
      ownerEmailContent = `
        <h2>Reserva Cancelada</h2>
        <p><strong>Evento:</strong> ${eventTitle}</p>
        <p><strong>Attendee:</strong> ${attendeeName}</p>
        <p><strong>Fecha:</strong> ${formattedSlot}</p>
        <p><strong>Razón de Cancelación:</strong> ${reason}</p>
      `;

      attendeeEmailContent = `
        <h2>Confirmación de Cancelación</h2>
        <p>Hola ${attendeeName},</p>
        <p>Tu reserva para <strong>${eventTitle}</strong> ha sido cancelada.</p>
        <p><strong>Fecha:</strong> ${formattedSlot}</p>
        <p><strong>Razón:</strong> ${reason}</p>
      `;
    }

    // Send email to owner
    const ownerEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "noreply@mycalendar.pro",
        to: ownerEmail,
        subject: `${type === "booking" ? "Nueva Reserva" : type === "reschedule" ? "Cambio de Reserva" : "Reserva Cancelada"} - ${eventTitle}`,
        html: ownerEmailContent,
      }),
    });

    console.log("Owner email response:", ownerEmailResponse.status);
    const ownerEmailText = await ownerEmailResponse.text();
    console.log("Owner email response body:", ownerEmailText);

    if (!ownerEmailResponse.ok) {
      throw new Error(
        `Failed to send owner email: ${ownerEmailResponse.status} ${ownerEmailText}`
      );
    }

    // Send email to attendee
    const attendeeEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "noreply@mycalendar.pro",
        to: attendeeEmail,
        subject: `${type === "booking" ? "Confirmación de Reserva" : type === "reschedule" ? "Reserva Reprogramada" : "Cancelación de Reserva"} - ${eventTitle}`,
        html: attendeeEmailContent,
      }),
    });

    console.log("Attendee email response:", attendeeEmailResponse.status);
    const attendeeEmailText = await attendeeEmailResponse.text();
    console.log("Attendee email response body:", attendeeEmailText);

    if (!attendeeEmailResponse.ok) {
      throw new Error(
        `Failed to send attendee email: ${attendeeEmailResponse.status} ${attendeeEmailText}`
      );
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
