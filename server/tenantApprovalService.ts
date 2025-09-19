import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import type { DatabaseStorage } from "./storage.js";

// ========================================
// PHASE 3: TENANT APPROVAL WORKFLOW
// ========================================

/**
 * Secure tenant approval system for maintenance appointments
 * Generates signed tokens and handles approval/decline workflows
 */

// Approval request validation
const ApprovalRequest = z.object({
  appointmentId: z.string(),
  tenantEmail: z.string().email().optional(),
  tenantPhone: z.string().optional(),
  expiresInHours: z.number().min(1).max(72).default(24), // 1-72 hours
  notificationMethod: z.enum(['email', 'sms', 'both']).default('email')
});

const ApprovalResponse = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
  preferredTimeSlot: z.object({
    start: z.string(), // ISO string
    end: z.string()
  }).optional(),
  contactPreference: z.enum(['email', 'phone', 'text']).optional()
});

type ApprovalRequestType = z.infer<typeof ApprovalRequest>;
type ApprovalResponseType = z.infer<typeof ApprovalResponse>;

interface ApprovalToken {
  token: string;
  expiresAt: string;
  appointmentId: string;
  approvalUrl: string;
  declineUrl: string;
}

interface ApprovalStatus {
  status: 'pending' | 'approved' | 'declined' | 'expired';
  respondedAt?: string;
  response?: ApprovalResponseType;
  expiresAt: string;
}

export class TenantApprovalService {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(
    private storage: DatabaseStorage,
    secretKey?: string,
    baseUrl?: string
  ) {
    this.secretKey = secretKey || process.env.APPROVAL_SECRET_KEY || 'dev-secret-key';
    this.baseUrl = baseUrl || process.env.PUBLIC_URL || 'https://allai-property.replit.app';
  }

  /**
   * Generate secure approval token for tenant appointment approval
   */
  async generateApprovalToken(request: ApprovalRequestType): Promise<ApprovalToken> {
    try {
      const validatedRequest = ApprovalRequest.parse(request);
      
      // Get appointment details
      const appointment = await this.storage.getAppointment(validatedRequest.appointmentId);
      if (!appointment) {
        throw new Error("Appointment not found");
      }

      // Create token payload with expiration
      const expiresAt = new Date(Date.now() + validatedRequest.expiresInHours * 60 * 60 * 1000);
      const tokenPayload = {
        appointmentId: appointment.id,
        orgId: appointment.orgId,
        expiresAt: expiresAt.getTime(),
        iat: Date.now()
      };

      // Generate HMAC-signed token
      const payloadStr = JSON.stringify(tokenPayload);
      const signature = createHmac('sha256', this.secretKey)
        .update(payloadStr)
        .digest('hex');
      
      const token = Buffer.from(`${payloadStr}.${signature}`).toString('base64url');

      // Update appointment with approval token
      await this.storage.updateAppointment(appointment.id, {
        approvalToken: token,
        approvalExpiresAt: expiresAt,
        status: "Proposed" // Set to proposed status awaiting approval
      });

      const approvalUrl = `${this.baseUrl}/api/approvals/${token}?action=approve`;
      const declineUrl = `${this.baseUrl}/api/approvals/${token}?action=decline`;

      console.log(`🔐 Generated approval token for appointment ${appointment.id}`, {
        expiresAt: expiresAt.toISOString(),
        expiresInHours: validatedRequest.expiresInHours
      });

      return {
        token,
        expiresAt: expiresAt.toISOString(),
        appointmentId: appointment.id,
        approvalUrl,
        declineUrl
      };

    } catch (error) {
      console.error("🚨 Approval token generation error:", error);
      throw new Error("Failed to generate approval token");
    }
  }

  /**
   * Verify and parse approval token
   */
  async verifyApprovalToken(token: string): Promise<any> {
    try {
      // Decode token
      const decoded = Buffer.from(token, 'base64url').toString();
      const [payloadStr, signature] = decoded.split('.');
      
      if (!payloadStr || !signature) {
        throw new Error("Invalid token format");
      }

      // Verify signature
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(payloadStr)
        .digest('hex');
      
      if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
        throw new Error("Invalid token signature");
      }

      const payload = JSON.parse(payloadStr);
      
      // Check expiration
      if (Date.now() > payload.expiresAt) {
        throw new Error("Token expired");
      }

      return payload;
    } catch (error) {
      console.error("🚨 Token verification error:", error);
      throw new Error("Invalid or expired approval token");
    }
  }

  /**
   * Process tenant approval response
   */
  async processApprovalResponse(
    token: string, 
    approved: boolean, 
    responseData?: Partial<ApprovalResponseType>
  ): Promise<ApprovalStatus> {
    try {
      // Verify token and get payload
      const payload = await this.verifyApprovalToken(token);
      
      // Get appointment
      const appointment = await this.storage.getAppointment(payload.appointmentId);
      if (!appointment) {
        throw new Error("Appointment not found");
      }

      // Validate appointment is still pending
      if (appointment.status !== "Proposed") {
        throw new Error(`Appointment is no longer pending approval (status: ${appointment.status})`);
      }

      // Create response object
      const response: ApprovalResponseType = {
        approved,
        reason: responseData?.reason,
        preferredTimeSlot: responseData?.preferredTimeSlot,
        contactPreference: responseData?.contactPreference
      };

      const respondedAt = new Date().toISOString();

      // Update appointment status based on response
      const newStatus = approved ? "Approved" : "Cancelled";
      await this.storage.updateAppointment(appointment.id, {
        status: newStatus,
        accessApproved: approved,
        notes: response.reason ? 
          `${appointment.notes || ''}\nTenant response: ${response.reason}`.trim() : 
          appointment.notes
      });

      // If declined with preferred time, could trigger rescheduling
      if (!approved && response.preferredTimeSlot) {
        console.log(`📅 Tenant declined but provided preferred time:`, response.preferredTimeSlot);
        // Could trigger AI re-scheduling here
      }

      console.log(`${approved ? '✅' : '❌'} Tenant ${approved ? 'approved' : 'declined'} appointment ${appointment.id}`);

      return {
        status: approved ? 'approved' : 'declined',
        respondedAt,
        response,
        expiresAt: new Date(payload.expiresAt).toISOString()
      };

    } catch (error) {
      console.error("🚨 Approval processing error:", error);
      throw error;
    }
  }

  /**
   * Get approval status for an appointment
   */
  async getApprovalStatus(appointmentId: string): Promise<ApprovalStatus | null> {
    try {
      const appointment = await this.storage.getAppointment(appointmentId);
      if (!appointment) return null;

      if (!appointment.approvalToken || !appointment.approvalExpiresAt) {
        return null; // No approval process initiated
      }

      const now = new Date();
      const expiresAt = new Date(appointment.approvalExpiresAt);
      
      let status: 'pending' | 'approved' | 'declined' | 'expired' = 'pending';
      
      if (now > expiresAt) {
        status = 'expired';
      } else if (appointment.status === 'Approved' || appointment.accessApproved) {
        status = 'approved';
      } else if (appointment.status === 'Cancelled') {
        status = 'declined';
      }

      return {
        status,
        expiresAt: expiresAt.toISOString(),
        respondedAt: appointment.updatedAt?.toISOString()
      };

    } catch (error) {
      console.error("🚨 Error getting approval status:", error);
      return null;
    }
  }

  /**
   * Generate notification message for tenant
   */
  generateApprovalMessage(appointment: any, contractor: any, token: ApprovalToken): string {
    const formattedDate = new Date(appointment.scheduledStartAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
    
    const formattedTime = new Date(appointment.scheduledStartAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return `
🔧 MAINTENANCE APPOINTMENT APPROVAL NEEDED

Hello! A maintenance appointment has been scheduled for your unit and requires your approval:

📅 Date: ${formattedDate}
🕒 Time: ${formattedTime}
👷 Contractor: ${contractor.name}
📋 Work: ${appointment.title}
📧 Contact: ${contractor.email || 'N/A'}
📱 Phone: ${contractor.phone || 'N/A'}

The contractor will need access to your unit to complete this maintenance work. Please review and respond:

✅ APPROVE: ${token.approvalUrl}
❌ DECLINE: ${token.declineUrl}

⏰ Please respond by ${new Date(token.expiresAt).toLocaleDateString()} at ${new Date(token.expiresAt).toLocaleTimeString()}

If you have questions about this maintenance request, please contact property management.

This is an automated message. Please do not reply directly to this notification.
    `.trim();
  }
}