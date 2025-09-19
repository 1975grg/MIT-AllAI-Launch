import { dataAuditService } from "./dataAudit";

async function runDataAudit() {
  console.log("🚀 Starting data audit test...\n");
  
  try {
    // Run the comprehensive audit
    const auditResult = await dataAuditService.auditAppointmentData();
    
    // Generate and display the report
    const report = dataAuditService.generateAuditReport(auditResult);
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 FULL AUDIT REPORT");
    console.log("=".repeat(60));
    console.log(report);
    console.log("=".repeat(60));
    
    // Summary
    console.log("\n🎯 AUDIT SUMMARY:");
    console.log(`- Total Appointments: ${auditResult.totalAppointments}`);
    console.log(`- Total Issues: ${auditResult.summary.totalIssues}`);
    console.log(`- Orphaned Records: ${auditResult.summary.issueBreakdown.orphaned}`);
    console.log(`- Cross-Org Violations: ${auditResult.summary.issueBreakdown.crossOrg}`);
    console.log(`- Scheduling Overlaps: ${auditResult.summary.issueBreakdown.overlaps}`);
    console.log(`- Status: ${auditResult.summary.hasIssues ? "❌ ISSUES FOUND" : "✅ CLEAN"}`);
    
    if (auditResult.summary.hasIssues) {
      console.log("\n🔧 NEXT STEPS:");
      console.log("- Phase 2 data cleanup required before Phase 3");
      console.log("- Review specific issues above for remediation");
    } else {
      console.log("\n✅ DATA IS CLEAN:");
      console.log("- Ready for Phase 3 database constraints");
      console.log("- No cleanup required");
    }
    
  } catch (error) {
    console.error("❌ Audit failed:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack trace:", error.stack);
    }
  }
}

// Run the audit
runDataAudit()
  .then(() => {
    console.log("\n✅ Audit test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Audit test failed:", error);
    process.exit(1);
  });