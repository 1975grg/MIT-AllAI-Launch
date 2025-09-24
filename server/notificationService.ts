import { TransactionalSMSApi, TransactionalSMSApiApiKeys } from '@getbrevo/brevo';
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
  orgId: string;
}

class NotificationService {
  private smsApi?: TransactionalSMSApi;
  private wsConnections: WebSocketConnection[] = [];

  constructor() {
    this.initializeNotificationAPIs();
  }

  private initializeNotificationAPIs() {
    try {
      // Check SendGrid API key (will use HTTP API directly)
      if (process.env.SENDGRID_API_KEY) {
        console.log('✅ SendGrid HTTP API ready');
      } else {
        console.warn('⚠️ SENDGRID_API_KEY not found - email notifications will be disabled');
      }

      // Initialize Brevo SMS API (keeping SMS via Brevo for now)
      if (process.env.BREVO_API_KEY) {
        this.smsApi = new TransactionalSMSApi();
        this.smsApi.setApiKey(TransactionalSMSApiApiKeys.apiKey, process.env.BREVO_API_KEY);
        console.log('✅ Brevo SMS API initialized');
      } else {
        console.warn('⚠️ BREVO_API_KEY not found - SMS notifications will be disabled');
      }
    } catch (error) {
      console.error('❌ Failed to initialize notification APIs:', error);
    }
  }

  // WebSocket connection management with organization context
  addWebSocketConnection(ws: WebSocket, userContext: {userId: string, role: string, orgId: string}) {
    this.wsConnections.push({ ws, ...userContext });
    console.log(`🔗 WebSocket connected: ${userContext.userId} (${userContext.role}) in org ${userContext.orgId}`);
  }

  removeWebSocketConnection(ws: WebSocket) {
    const index = this.wsConnections.findIndex(conn => conn.ws === ws);
    if (index !== -1) {
      const conn = this.wsConnections[index];
      this.wsConnections.splice(index, 1);
      console.log(`🔌 WebSocket disconnected: ${conn.userId} (${conn.role}) from org ${conn.orgId || 'unknown'}`);
    }
  }

  // Send real-time push notification via WebSocket
  private sendWebSocketNotification(targetUserId: string, notification: NotificationData, targetOrgId?: string) {
    const connections = this.wsConnections.filter(conn => {
      if (conn.userId !== targetUserId || conn.ws.readyState !== WebSocket.OPEN) return false;
      // Organization scoping for security - only send to connections in the same org
      if (targetOrgId && conn.orgId && conn.orgId !== targetOrgId) return false;
      return true;
    });

    connections.forEach(conn => {
      try {
        conn.ws.send(JSON.stringify({
          type: 'notification',
          data: notification
        }));
        console.log(`📱 Real-time notification sent to ${targetUserId} (${conn.role})`);
      } catch (error) {
        console.error(`❌ Failed to send WebSocket notification to ${targetUserId}:`, error);
      }
    });
  }

  // Send email notification via SendGrid HTTP API
  async sendEmailNotification(notification: NotificationData, recipientEmail: string): Promise<boolean> {
    try {
      if (!process.env.SENDGRID_API_KEY) {
        console.warn('📧 SendGrid API key not found - skipping email notification');
        return false;
      }
      
      const emailContent = this.generateEmailContent(notification);
      
      const payload = {
        personalizations: [{
          to: [{ email: recipientEmail }],
          subject: notification.subject
        }],
        from: {
          email: 'omar@vibeapp.social',
          name: 'AllAI Property Maintenance'
        },
        content: [
          {
            type: 'text/plain',
            value: emailContent.text
          },
          {
            type: 'text/html', 
            value: emailContent.html
          }
        ]
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`📧 SendGrid HTTP API email sent to ${recipientEmail}`);
        return true;
      } else {
        const errorText = await response.text();
        console.error(`❌ SendGrid HTTP API error (${response.status}): ${errorText}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to send email via SendGrid HTTP API to ${recipientEmail}:`, error);
      return false;
    }
  }

  // Format phone number to international E.164 format for Brevo
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    const cleanPhone = phone.replace(/\D/g, '');
    
    // If already has country code (11+ digits), add + prefix
    if (cleanPhone.length >= 11 && cleanPhone.startsWith('1')) {
      return '+' + cleanPhone;
    }
    
    // If 10 digits, assume US/Canada and add +1
    if (cleanPhone.length === 10) {
      return '+1' + cleanPhone;
    }
    
    // If already starts with +, return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Default: assume US/Canada for other formats
    return '+1' + cleanPhone;
  }

  // Send SMS notification
  async sendSMSNotification(notification: NotificationData, recipientPhone: string): Promise<boolean> {
    const formattedPhone = this.formatPhoneNumber(recipientPhone);
    
    try {
      if (!this.smsApi) {
        console.warn('📱 SMS API not initialized - skipping SMS notification');
        return false;
      }
      
      const smsContent = this.generateSMSContent(notification);
      
      await this.smsApi.sendTransacSms({
        recipient: formattedPhone,
        content: smsContent,
        sender: 'AllAIProp',
        type: 'transactional' as any
      });

      console.log(`📱 SMS notification sent to ${formattedPhone} (original: ${recipientPhone})`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${formattedPhone} (original: ${recipientPhone}):`, error);
      return false;
    }
  }

  // Main notification dispatcher
  async notifyAdmins(notification: NotificationData, orgId: string): Promise<void> {
    try {
      const storage = (await import('./storage.js')).storage;
      
      // Get all users and find admin for this organization
      // For now, find the first user with this organization (simplified admin lookup)
      console.log(`🔍 Looking up admin for org ${orgId} for ${notification.type} notification`);
      
      // Try to get admin user for this organization
      let adminUser;
      try {
        // Get organization info to find the owner (simplified admin approach)
        const org = await storage.getOrganization(orgId);
        if (org?.ownerId) {
          adminUser = await storage.getUser(org.ownerId);
          console.log(`📧 Found org owner: ${adminUser?.email} for org ${orgId} notifications`);
        }
        
        if (!adminUser) {
          console.warn(`⚠️ No admin/owner found for org ${orgId}`);
          return;
        }
      } catch (error) {
        console.warn(`⚠️ Could not find admin user for org ${orgId}, skipping admin notification: ${error}`);
        return;
      }
      
      if (!adminUser || !adminUser.email) {
        console.warn(`⚠️ No admin user or email found for org ${orgId}`);
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
      this.sendWebSocketNotification(adminUser.id, notification, orgId);

      await Promise.allSettled(promises);
      console.log(`✅ Admin notifications dispatched for ${notification.type}`);
    } catch (error) {
      console.error('❌ Failed to notify admins:', error);
    }
  }

  // Test method to send WebSocket notification to anonymous connections  
  async sendTestWebSocketNotification(notification: NotificationData, orgId: string): Promise<void> {
    try {
      this.sendWebSocketNotification('anonymous', notification, orgId);
      console.log(`✅ Test WebSocket notification sent to anonymous connections`);
    } catch (error) {
      console.error('❌ Failed to send test WebSocket notification:', error);
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

  // 🎯 Notify student via email about case status updates
  async notifyStudent(studentEmail: string, subject: string, message: string, orgId: string): Promise<void> {
    try {
      console.log(`📧 Sending student notification to ${studentEmail}: ${subject}`);

      const notification: NotificationData = {
        to: studentEmail,
        type: 'case_updated',
        subject,
        message,
        urgencyLevel: 'normal'
      };

      // Send email notification
      await this.sendEmailNotification(notification, studentEmail);
      
      console.log(`✅ Student notification sent to ${studentEmail}`);
    } catch (error) {
      console.error('❌ Failed to notify student:', error);
      throw error; // Re-throw so calling code knows it failed
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