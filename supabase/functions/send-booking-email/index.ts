import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

interface RequestBody {
  ownerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  eventId: string;
  slot: string;
  locationUrl?: string;
  type?: "booking" | "reschedule" | "cancel";
  reason?: string;
  oldSlot?: string;
  newSlot?: string;
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
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
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
        from: "noreply@meetsv.com",
        to: ownerEmail,
        subject: `${type === "booking" ? "Nueva Reserva" : type === "reschedule" ? "Cambio de Reserva" : "Reserva Cancelada"} - ${eventTitle}`,
        html: ownerEmailContent,
      }),
    });

    if (!ownerEmailResponse.ok) {
      throw new Error(
        `Failed to send owner email: ${ownerEmailResponse.statusText}`
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
        from: "noreply@meetsv.com",
        to: attendeeEmail,
        subject: `${type === "booking" ? "Confirmación de Reserva" : type === "reschedule" ? "Reserva Reprogramada" : "Cancelación de Reserva"} - ${eventTitle}`,
        html: attendeeEmailContent,
      }),
    });

    if (!attendeeEmailResponse.ok) {
      throw new Error(
        `Failed to send attendee email: ${attendeeEmailResponse.statusText}`
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
