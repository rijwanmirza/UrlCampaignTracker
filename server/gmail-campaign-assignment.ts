import { storage } from "./storage";
import { InsertGmailCampaignAssignment, UpdateGmailCampaignAssignment } from "@shared/schema";

/**
 * Gmail Campaign Assignment Service
 * Manages assignments of URLs to campaigns based on click quantity ranges
 */
class GmailCampaignAssignmentService {
  /**
   * Get all Gmail campaign assignments
   */
  async getAllAssignments() {
    return await storage.getGmailCampaignAssignments();
  }

  /**
   * Get a specific Gmail campaign assignment by ID
   */
  async getAssignment(id: number) {
    return await storage.getGmailCampaignAssignment(id);
  }

  /**
   * Get all assignments for a specific campaign
   */
  async getAssignmentsForCampaign(campaignId: number) {
    return await storage.getGmailCampaignAssignmentsByCampaignId(campaignId);
  }

  /**
   * Create a new Gmail campaign assignment
   */
  async createAssignment(assignment: InsertGmailCampaignAssignment) {
    return await storage.createGmailCampaignAssignment(assignment);
  }

  /**
   * Update an existing Gmail campaign assignment
   */
  async updateAssignment(id: number, assignment: UpdateGmailCampaignAssignment) {
    return await storage.updateGmailCampaignAssignment(id, assignment);
  }

  /**
   * Delete a Gmail campaign assignment
   */
  async deleteAssignment(id: number) {
    return await storage.deleteGmailCampaignAssignment(id);
  }

  /**
   * Find the appropriate campaign ID for a given click quantity
   * This is used when processing Gmail emails to determine which campaign to assign URLs to
   */
  async findCampaignForClickQuantity(quantity: number) {
    return await storage.findCampaignIdForClickQuantity(quantity);
  }
}

export const gmailCampaignAssignmentService = new GmailCampaignAssignmentService();