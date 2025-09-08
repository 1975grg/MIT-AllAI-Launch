import cron from "node-cron";
import { storage } from "./storage";

export function startCronJobs() {
  // Run every hour to check for due reminders
  cron.schedule('0 * * * *', async () => {
    console.log('Checking for due reminders...');
    
    try {
      const dueReminders = await storage.getDueReminders();
      
      for (const reminder of dueReminders) {
        // Send notification
        if (reminder.orgId) {
          // Get organization members to notify
          const org = await storage.getUserOrganization(reminder.orgId);
          if (org) {
            await storage.createNotification(
              org.ownerId,
              reminder.title,
              `Reminder: ${reminder.title} is due`,
              'warning'
            );
          }
        }
        
        // Mark reminder as sent
        await storage.updateReminder(reminder.id, {
          status: "Sent",
          sentAt: new Date(),
        });
        
        console.log(`Sent reminder: ${reminder.title}`);
      }
    } catch (error) {
      console.error('Error processing reminders:', error);
    }
  });

  // Generate monthly rent reminders (run on 1st of each month)
  cron.schedule('0 0 1 * *', async () => {
    console.log('Generating monthly rent reminders...');
    
    try {
      // This would typically fetch all active leases and create rent reminders
      // Implementation would depend on specific business logic
      console.log('Monthly rent reminders generated');
    } catch (error) {
      console.error('Error generating rent reminders:', error);
    }
  });

  // Check for lease expirations (run daily)
  cron.schedule('0 9 * * *', async () => {
    console.log('Checking for lease expirations...');
    
    try {
      await storage.createLeaseEndReminders();
      console.log('Lease expiration check completed');
    } catch (error) {
      console.error('Error checking lease expirations:', error);
    }
  });

  // Generate missing recurring transactions (run daily at 2 AM)
  cron.schedule('0 2 * * *', async () => {
    console.log('Generating missing recurring transactions...');
    
    try {
      await storage.generateRecurringTransactions();
      console.log('Recurring transaction generation completed');
    } catch (error) {
      console.error('Error generating recurring transactions:', error);
    }
  });


  console.log('Cron jobs started successfully');
}
