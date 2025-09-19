import { db } from "./db";
import { 
  appointments, 
  smartCases, 
  vendors, 
  organizations 
} from "@shared/schema";
import { eq, and, or, ne, lt, gt, inArray } from "drizzle-orm";

export interface AuditResult {
  totalAppointments: number;
  orphanedAppointments: OrphanedRecord[];
  crossOrgViolations: CrossOrgViolation[];
  schedulingOverlaps: SchedulingOverlap[];
  summary: {
    hasIssues: boolean;
    totalIssues: number;
    issueBreakdown: {
      orphaned: number;
      crossOrg: number;
      overlaps: number;
    };
  };
}

export interface OrphanedRecord {
  appointmentId: string;
  caseId: string | null;
  contractorId: string;
  issue: "missing_case" | "missing_contractor" | "missing_both";
}

export interface CrossOrgViolation {
  appointmentId: string;
  appointmentOrgId: string;
  caseId: string | null;
  caseOrgId: string | null;
  contractorId: string;
  contractorOrgId: string | null;
  violationType: "case_org_mismatch" | "contractor_org_mismatch" | "both_mismatch";
}

export interface SchedulingOverlap {
  appointment1Id: string;
  appointment2Id: string;
  contractorId: string;
  overlapStart: Date;
  overlapEnd: Date;
  appointment1: {
    start: Date;
    end: Date;
    status: string;
  };
  appointment2: {
    start: Date;
    end: Date;
    status: string;
  };
}

export class DataAuditService {
  /**
   * Comprehensive audit of appointment data to identify constraint violations
   */
  async auditAppointmentData(): Promise<AuditResult> {
    console.log("🔍 Starting comprehensive appointment data audit...");
    
    // Get all appointments with related data
    const allAppointments = await db
      .select({
        id: appointments.id,
        caseId: appointments.caseId,
        contractorId: appointments.contractorId,
        orgId: appointments.orgId,
        scheduledStartAt: appointments.scheduledStartAt,
        scheduledEndAt: appointments.scheduledEndAt,
        status: appointments.status,
      })
      .from(appointments);

    console.log(`📊 Found ${allAppointments.length} total appointments to audit`);

    // Run all audit checks in parallel
    const [orphanedRecords, crossOrgViolations, schedulingOverlaps] = await Promise.all([
      this.findOrphanedAppointments(allAppointments),
      this.findCrossOrgViolations(allAppointments),
      this.findSchedulingOverlaps(allAppointments),
    ]);

    const totalIssues = orphanedRecords.length + crossOrgViolations.length + schedulingOverlaps.length;

    const result: AuditResult = {
      totalAppointments: allAppointments.length,
      orphanedAppointments: orphanedRecords,
      crossOrgViolations,
      schedulingOverlaps,
      summary: {
        hasIssues: totalIssues > 0,
        totalIssues,
        issueBreakdown: {
          orphaned: orphanedRecords.length,
          crossOrg: crossOrgViolations.length,
          overlaps: schedulingOverlaps.length,
        },
      },
    };

    console.log("✅ Data audit complete:", result.summary);
    return result;
  }

  /**
   * Find appointments that reference non-existent cases or contractors
   */
  private async findOrphanedAppointments(appointments: any[]): Promise<OrphanedRecord[]> {
    console.log("🔍 Checking for orphaned appointment records...");
    
    const orphaned: OrphanedRecord[] = [];

    for (const appointment of appointments) {
      const issues: string[] = [];

      // Check if case exists (if caseId is provided)
      if (appointment.caseId) {
        const caseExists = await db
          .select({ id: smartCases.id })
          .from(smartCases)
          .where(eq(smartCases.id, appointment.caseId))
          .limit(1);
        
        if (caseExists.length === 0) {
          issues.push("missing_case");
        }
      }

      // Check if contractor exists
      const contractorExists = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.id, appointment.contractorId))
        .limit(1);
      
      if (contractorExists.length === 0) {
        issues.push("missing_contractor");
      }

      // Record orphaned appointment
      if (issues.length > 0) {
        let issueType: OrphanedRecord["issue"];
        if (issues.includes("missing_case") && issues.includes("missing_contractor")) {
          issueType = "missing_both";
        } else if (issues.includes("missing_case")) {
          issueType = "missing_case";
        } else {
          issueType = "missing_contractor";
        }

        orphaned.push({
          appointmentId: appointment.id,
          caseId: appointment.caseId,
          contractorId: appointment.contractorId,
          issue: issueType,
        });
      }
    }

    console.log(`📋 Found ${orphaned.length} orphaned appointment records`);
    return orphaned;
  }

  /**
   * Find appointments where case and contractor belong to different organizations
   */
  private async findCrossOrgViolations(appointments: any[]): Promise<CrossOrgViolation[]> {
    console.log("🔍 Checking for cross-organization violations...");
    
    const violations: CrossOrgViolation[] = [];

    for (const appointment of appointments) {
      let caseOrgId: string | null = null;
      let contractorOrgId: string | null = null;

      // Get case organization (if caseId exists)
      if (appointment.caseId) {
        const caseOrg = await db
          .select({ orgId: smartCases.orgId })
          .from(smartCases)
          .where(eq(smartCases.id, appointment.caseId))
          .limit(1);
        
        caseOrgId = caseOrg.length > 0 ? caseOrg[0].orgId : null;
      }

      // Get contractor organization
      const contractorOrg = await db
        .select({ orgId: vendors.orgId })
        .from(vendors)
        .where(eq(vendors.id, appointment.contractorId))
        .limit(1);
      
      contractorOrgId = contractorOrg.length > 0 ? contractorOrg[0].orgId : null;

      // Check for violations
      const violations_found: string[] = [];
      
      if (caseOrgId && caseOrgId !== appointment.orgId) {
        violations_found.push("case_org_mismatch");
      }
      
      if (contractorOrgId && contractorOrgId !== appointment.orgId) {
        violations_found.push("contractor_org_mismatch");
      }

      if (violations_found.length > 0) {
        let violationType: CrossOrgViolation["violationType"];
        if (violations_found.includes("case_org_mismatch") && violations_found.includes("contractor_org_mismatch")) {
          violationType = "both_mismatch";
        } else if (violations_found.includes("case_org_mismatch")) {
          violationType = "case_org_mismatch";
        } else {
          violationType = "contractor_org_mismatch";
        }

        violations.push({
          appointmentId: appointment.id,
          appointmentOrgId: appointment.orgId,
          caseId: appointment.caseId,
          caseOrgId,
          contractorId: appointment.contractorId,
          contractorOrgId,
          violationType,
        });
      }
    }

    console.log(`🚨 Found ${violations.length} cross-organization violations`);
    return violations;
  }

  /**
   * Find scheduling overlaps that would violate upcoming database constraints
   */
  private async findSchedulingOverlaps(appointments: any[]): Promise<SchedulingOverlap[]> {
    console.log("🔍 Checking for scheduling overlaps...");
    
    const overlaps: SchedulingOverlap[] = [];
    
    // Group appointments by contractor for efficient overlap checking
    const appointmentsByContractor = new Map<string, any[]>();
    
    for (const appointment of appointments) {
      // Only check active appointments that would conflict
      if (!["Pending", "Confirmed", "In Progress", "Rescheduled"].includes(appointment.status)) {
        continue;
      }
      
      if (!appointmentsByContractor.has(appointment.contractorId)) {
        appointmentsByContractor.set(appointment.contractorId, []);
      }
      appointmentsByContractor.get(appointment.contractorId)!.push(appointment);
    }

    // Check for overlaps within each contractor's appointments
    for (const [contractorId, contractorAppointments] of Array.from(appointmentsByContractor.entries())) {
      for (let i = 0; i < contractorAppointments.length; i++) {
        for (let j = i + 1; j < contractorAppointments.length; j++) {
          const apt1 = contractorAppointments[i];
          const apt2 = contractorAppointments[j];

          // Check if appointments overlap using standard interval overlap logic
          const apt1Start = new Date(apt1.scheduledStartAt);
          const apt1End = new Date(apt1.scheduledEndAt);
          const apt2Start = new Date(apt2.scheduledStartAt);
          const apt2End = new Date(apt2.scheduledEndAt);

          const hasOverlap = apt1Start < apt2End && apt2Start < apt1End;

          if (hasOverlap) {
            const overlapStart = new Date(Math.max(apt1Start.getTime(), apt2Start.getTime()));
            const overlapEnd = new Date(Math.min(apt1End.getTime(), apt2End.getTime()));

            overlaps.push({
              appointment1Id: apt1.id,
              appointment2Id: apt2.id,
              contractorId,
              overlapStart,
              overlapEnd,
              appointment1: {
                start: apt1Start,
                end: apt1End,
                status: apt1.status,
              },
              appointment2: {
                start: apt2Start,
                end: apt2End,
                status: apt2.status,
              },
            });
          }
        }
      }
    }

    console.log(`⏰ Found ${overlaps.length} scheduling overlaps`);
    return overlaps;
  }

  /**
   * Generate a detailed audit report
   */
  generateAuditReport(audit: AuditResult): string {
    const report = [
      "📊 APPOINTMENT DATA AUDIT REPORT",
      "=" .repeat(50),
      "",
      `Total Appointments: ${audit.totalAppointments}`,
      `Total Issues Found: ${audit.summary.totalIssues}`,
      `Audit Status: ${audit.summary.hasIssues ? "❌ ISSUES FOUND" : "✅ CLEAN"}`,
      "",
      "📋 ISSUE BREAKDOWN:",
      `• Orphaned Records: ${audit.summary.issueBreakdown.orphaned}`,
      `• Cross-Org Violations: ${audit.summary.issueBreakdown.crossOrg}`,
      `• Scheduling Overlaps: ${audit.summary.issueBreakdown.overlaps}`,
      "",
    ];

    if (audit.orphanedAppointments.length > 0) {
      report.push("🔗 ORPHANED RECORDS:");
      audit.orphanedAppointments.forEach((record, i) => {
        report.push(`${i + 1}. Appointment ${record.appointmentId}`);
        report.push(`   Issue: ${record.issue}`);
        report.push(`   Case ID: ${record.caseId || "None"}`);
        report.push(`   Contractor ID: ${record.contractorId}`);
        report.push("");
      });
    }

    if (audit.crossOrgViolations.length > 0) {
      report.push("🚨 CROSS-ORG VIOLATIONS:");
      audit.crossOrgViolations.forEach((violation, i) => {
        report.push(`${i + 1}. Appointment ${violation.appointmentId}`);
        report.push(`   Violation: ${violation.violationType}`);
        report.push(`   Appointment Org: ${violation.appointmentOrgId}`);
        report.push(`   Case Org: ${violation.caseOrgId || "N/A"}`);
        report.push(`   Contractor Org: ${violation.contractorOrgId || "N/A"}`);
        report.push("");
      });
    }

    if (audit.schedulingOverlaps.length > 0) {
      report.push("⏰ SCHEDULING OVERLAPS:");
      audit.schedulingOverlaps.forEach((overlap, i) => {
        report.push(`${i + 1}. Contractor ${overlap.contractorId}`);
        report.push(`   Appointments: ${overlap.appointment1Id} & ${overlap.appointment2Id}`);
        report.push(`   Overlap: ${overlap.overlapStart.toISOString()} - ${overlap.overlapEnd.toISOString()}`);
        report.push(`   App1: ${overlap.appointment1.start.toISOString()} - ${overlap.appointment1.end.toISOString()} (${overlap.appointment1.status})`);
        report.push(`   App2: ${overlap.appointment2.start.toISOString()} - ${overlap.appointment2.end.toISOString()} (${overlap.appointment2.status})`);
        report.push("");
      });
    }

    return report.join("\n");
  }
}

export const dataAuditService = new DataAuditService();