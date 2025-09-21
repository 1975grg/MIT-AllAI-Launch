import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys, TransactionalSMSApi, TransactionalSMSApiApiKeys } from '@getbrevo/brevo';
import { WebSocket } from 'ws';

interface NotificationData {
  to: string;
  subject: string;
  message: string;
  type: 'case_created' | 'contractor_assigned' | 'case_updated' | 'emergency_alert';
  caseId?: string;
  caseNumber?: string;
  urgencyLevel?: string;
  metadata?: any;
}

interface WebSocketConnection {
  ws: WebSocket;
  userId: string;
  role: string;
}

class NotificationService {
  private emailApi?: TransactionalEmailsApi;
  private smsApi?: TransactionalSMSApi;
  private wsConnections: WebSocketConnection[] = [];

  constructor() {
    // Lazy initialization to prevent server crashes if BREVO_API_KEY is missing
    this.initializeBrevoAPIs();
  }

  private initializeBrevoAPIs() {
    try {
      if (!process.env.BREVO_API_KEY) {
        console.warn('⚠️ BREVO_API_KEY not found - email/SMS notifications will be disabled');
        return;
      }

      // Initialize Brevo email API
      this.emailApi = new TransactionalEmailsApi();
      this.emailApi.setApiKey(TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

      // Initialize Brevo SMS API
      this.smsApi = new TransactionalSMSApi();
      this.smsApi.setApiKey(TransactionalSMSApiApiKeys.apiKey, process.env.BREVO_API_KEY);
      
      console.log('✅ Brevo email/SMS APIs initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Brevo APIs:', error);
    }
  }

  // WebSocket connection management
  addWebSocketConnection(ws: WebSocket, userId: string, role: string) {
    this.wsConnections.push({ ws, userId, role });
    console.log(`🔗 WebSocket connected: ${userId} (${role})`);
  }

  removeWebSocketConnection(ws: WebSocket) {
    const index = this.wsConnections.findIndex(conn => conn.ws === ws);
    if (index !== -1) {
      const conn = this.wsConnections[index];
      this.wsConnections.splice(index, 1);
      console.log(`🔌 WebSocket disconnected: ${conn.userId} (${conn.role})`);
    }
  }

  // Send real-time push notification via WebSocket
  private sendWebSocketNotification(targetUserId: string, notification: NotificationData) {
    const connections = this.wsConnections.filter(conn => 
      conn.userId === targetUserId && conn.ws.readyState === WebSocket.OPEN
    );

    connections.forEach(conn => {
      try {
        conn.ws.send(JSON.stringify({
          type: 'notification',
          data: notification
        }));
        console.log(`📱 Real-time notification sent to ${targetUserId}`);
      } catch (error) {
        console.error(`❌ Failed to send WebSocket notification to ${targetUserId}:`, error);
      }
    });
  }

  // Send email notification
  async sendEmailNotification(notification: NotificationData, recipientEmail: string): Promise<boolean> {
    try {
      if (!this.emailApi) {
        console.warn('📧 Email API not initialized - skipping email notification');
        return false;
      }
      
      const emailContent = this.generateEmailContent(notification);
      
      await this.emailApi.sendTransacEmail({
        to: [{ email: recipientEmail }],
        subject: notification.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        sender: { 
          email: 'maintenance@allai-property.edu', 
          name: 'AllAI Property Maintenance' 
        }
      });

      console.log(`📧 Email notification sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send email to ${recipientEmail}:`, error);
      return false;
    }
  }

  // Send SMS notification
  async sendSMSNotification(notification: NotificationData, recipientPhone: string): Promise<boolean> {
    try {
      if (!this.smsApi) {
        console.warn('📱 SMS API not initialized - skipping SMS notification');
        return false;
      }
      
      const smsContent = this.generateSMSContent(notification);
      
      await this.smsApi.sendTransacSms({
        recipient: recipientPhone,
        content: smsContent,
        sender: 'AllAIProp',
        type: 'transactional' as any
      });

      console.log(`📱 SMS notification sent to ${recipientPhone}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${recipientPhone}:`, error);
      return false;
    }
  }

  // Main notification dispatcher
  async notifyAdmins(notification: NotificationData, orgId: string): Promise<void> {
    try {
      const storage = (await import('./storage.js')).storage;
      
      // Get organization details - use getOrganizationById or find alternative
      // For now, get admin users directly from organization members
      const adminMembers = await storage.getOrganizationMembersByRole(orgId, 'admin');
      if (!adminMembers || adminMembers.length === 0) {
        console.error(`❌ No admin members found for organization ${orgId}`);
        return;
      }
      
      // Get the first admin user
      const adminUser = await storage.getUser(adminMembers[0].userId);
      if (!adminUser) {
        console.error(`❌ Admin user not found for organization ${orgId}`);
        return;
      }

      // Send all notification types
      const promises = [];

      // Email notification
      if (adminUser.email) {
        promises.push(this.sendEmailNotification(notification, adminUser.email));
      }

      // SMS notification (if phone number available)
      if (adminUser.phone) {
        promises.push(this.sendSMSNotification(notification, adminUser.phone));
      }

      // Real-time WebSocket notification
      this.sendWebSocketNotification(adminMembers[0].userId, notification);

      await Promise.allSettled(promises);
      console.log(`✅ Admin notifications dispatched for ${notification.type}`);
    } catch (error) {
      console.error('❌ Failed to notify admins:', error);
    }
  }

  // Notify specific contractor
  async notifyContractor(notification: NotificationData, contractorId: string): Promise<void> {
    try {
      const storage = (await import('./storage.js')).storage;
      
      const contractor = await storage.getUser(contractorId);
      if (!contractor) {
        console.error(`❌ Contractor ${contractorId} not found`);
        return;
      }

      // Send all notification types
      const promises = [];

      // Email notification
      if (contractor.email) {
        promises.push(this.sendEmailNotification(notification, contractor.email));
      }

      // SMS notification (if phone number available)
      if (contractor.phone) {
        promises.push(this.sendSMSNotification(notification, contractor.phone));
      }

      // Real-time WebSocket notification
      this.sendWebSocketNotification(contractorId, notification);

      await Promise.allSettled(promises);
      console.log(`✅ Contractor notifications dispatched for ${notification.type}`);
    } catch (error) {
      console.error('❌ Failed to notify contractor:', error);
    }
  }

  // Generate email content based on notification type
  private generateEmailContent(notification: NotificationData): { html: string; text: string } {
    const { type, subject, message, caseNumber, urgencyLevel } = notification;

    let html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #2c3e50; margin: 0;">AllAI Property Maintenance</h2>
            </div>
    `;

    switch (type) {
      case 'case_created':
        html += `
          <h3 style="color: #e74c3c;">🚨 New Maintenance Case Created</h3>
          <p><strong>Case Number:</strong> ${caseNumber}</p>
          <p><strong>Urgency Level:</strong> <span style="color: ${this.getUrgencyColor(urgencyLevel)}">${urgencyLevel}</span></p>
          <p><strong>Description:</strong> ${message}</p>
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Action Required:</strong> Please review and assign a contractor to this case.</p>
          </div>
        `;
        break;
      
      case 'contractor_assigned':
        html += `
          <h3 style="color: #27ae60;">👷 New Assignment</h3>
          <p><strong>Case Number:</strong> ${caseNumber}</p>
          <p><strong>Urgency Level:</strong> <span style="color: ${this.getUrgencyColor(urgencyLevel)}">${urgencyLevel}</span></p>
          <p><strong>Details:</strong> ${message}</p>
          <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Next Steps:</strong> Please log into the contractor dashboard to view details and schedule service.</p>
          </div>
        `;
        break;
        
      default:
        html += `
          <h3>${subject}</h3>
          <p>${message}</p>
        `;
    }

    html += `
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            This is an automated notification from AllAI Property Maintenance System.
          </p>
        </div>
      </body>
      </html>
    `;

    const text = `
AllAI Property Maintenance

${subject}

${message}

${caseNumber ? `Case Number: ${caseNumber}` : ''}
${urgencyLevel ? `Urgency Level: ${urgencyLevel}` : ''}

This is an automated notification from AllAI Property Maintenance System.
    `.trim();

    return { html, text };
  }

  // Generate SMS content (shorter format)
  private generateSMSContent(notification: NotificationData): string {
    const { type, caseNumber, urgencyLevel, message } = notification;

    switch (type) {
      case 'case_created':
        return `🚨 NEW CASE: ${caseNumber} (${urgencyLevel}) - ${message.substring(0, 80)}... Please check admin dashboard.`;
      
      case 'contractor_assigned':
        return `👷 NEW JOB: ${caseNumber} (${urgencyLevel}) - ${message.substring(0, 80)}... Check contractor dashboard.`;
        
      default:
        return `AllAI Maintenance: ${message.substring(0, 140)}...`;
    }
  }

  // Get color based on urgency level
  private getUrgencyColor(urgencyLevel?: string): string {
    switch (urgencyLevel?.toLowerCase()) {
      case 'emergency': return '#e74c3c';
      case 'urgent': return '#f39c12';
      case 'medium': return '#f1c40f';
      case 'low': return '#27ae60';
      default: return '#7f8c8d';
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();