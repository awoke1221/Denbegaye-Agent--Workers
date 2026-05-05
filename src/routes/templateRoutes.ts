import { Express, Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";

interface AdminRequest extends Request {
  user?: any;
  profile?: any;
}

const adminOnly = async (req: AdminRequest, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  req.user = user;
  req.profile = profile;
  next();
};

// Get all templates with pagination and filtering
export const getTemplates = async (req: AdminRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      is_public,
      search,
      sort_by = "created_at",
      sort_order = "desc",
    } = req.query;

    let query = supabase.from("agent_templates").select(
      `
        *,
        profiles!created_by (
          full_name,
          email
        )
      `,
      { count: "exact" },
    );

    // Apply filters
    if (category) {
      query = query.eq("category", category);
    }
    if (is_public !== undefined) {
      query = query.eq("is_public", is_public === "true");
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sort_by as string, { ascending: sort_order === "asc" });

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);

    const { data: templates, error, count } = await query;

    if (error) {
      console.error("Error fetching templates:", error);
      return res.status(500).json({ error: "Failed to fetch templates" });
    }

    res.json({
      templates: templates || [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error in getTemplates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create a new template
export const createTemplate = async (req: AdminRequest, res: Response) => {
  try {
    const {
      name,
      description,
      category,
      config,
      ui_schema,
      is_public = false,
      version = "1.0.0",
    } = req.body;

    if (!name || !category || !config) {
      return res.status(400).json({
        error: "Missing required fields: name, category, config",
      });
    }

    const { data: template, error } = await supabase
      .from("agent_templates")
      .insert({
        name,
        description,
        category,
        config,
        ui_schema,
        is_public,
        version,
        created_by: req.user.id,
      })
      .select(
        `
        *,
        profiles!created_by (
          full_name,
          email
        )
      `,
      )
      .single();

    if (error) {
      console.error("Error creating template:", error);
      return res.status(500).json({ error: "Failed to create template" });
    }

    res.status(201).json(template);
  } catch (error) {
    console.error("Error in createTemplate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update an existing template
export const updateTemplate = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();

    const { data: template, error } = await supabase
      .from("agent_templates")
      .update(updates)
      .eq("id", id)
      .select(
        `
        *,
        profiles!created_by (
          full_name,
          email
        )
      `,
      )
      .single();

    if (error) {
      console.error("Error updating template:", error);
      return res.status(500).json({ error: "Failed to update template" });
    }

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(template);
  } catch (error) {
    console.error("Error in updateTemplate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a template
export const deleteTemplate = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("agent_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting template:", error);
      return res.status(500).json({ error: "Failed to delete template" });
    }

    res.json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error("Error in deleteTemplate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get template statistics
export const getTemplateStats = async (req: AdminRequest, res: Response) => {
  try {
    const [
      totalTemplatesResult,
      publicTemplatesResult,
      categoryStatsResult,
      recentTemplatesResult,
    ] = await Promise.all([
      supabase
        .from("agent_templates")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("agent_templates")
        .select("id", { count: "exact", head: true })
        .eq("is_public", true),
      supabase.from("agent_templates").select("category"),
      supabase
        .from("agent_templates")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const totalTemplates = totalTemplatesResult.count || 0;
    const publicTemplates = publicTemplatesResult.count || 0;

    // Calculate category distribution
    const categoryCounts: Record<string, number> = {};
    categoryStatsResult.data?.forEach((template: any) => {
      categoryCounts[template.category] =
        (categoryCounts[template.category] || 0) + 1;
    });

    const recentActivity =
      recentTemplatesResult.data?.map((template: any) => ({
        date: template.created_at,
        count: 1,
      })) || [];

    res.json({
      totalTemplates,
      publicTemplates,
      privateTemplates: totalTemplates - publicTemplates,
      categoryDistribution: categoryCounts,
      recentActivity,
    });
  } catch (error) {
    console.error("Error in getTemplateStats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Bulk operations
export const bulkUpdateTemplates = async (req: AdminRequest, res: Response) => {
  try {
    const { templateIds, updates } = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res
        .status(400)
        .json({ error: "templateIds must be a non-empty array" });
    }

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();

    const { data: templates, error } = await supabase
      .from("agent_templates")
      .update(updates)
      .in("id", templateIds).select(`
        *,
        profiles!created_by (
          full_name,
          email
        )
      `);

    if (error) {
      console.error("Error bulk updating templates:", error);
      return res.status(500).json({ error: "Failed to update templates" });
    }

    res.json({
      message: `Updated ${templates?.length || 0} templates`,
      templates: templates || [],
    });
  } catch (error) {
    console.error("Error in bulkUpdateTemplates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Duplicate a template
export const duplicateTemplate = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: originalTemplate, error: fetchError } = await supabase
      .from("agent_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !originalTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }

    const duplicatedTemplate = {
      ...originalTemplate,
      id: undefined, // Let Supabase generate new ID
      name: `${originalTemplate.name} (Copy)`,
      usage_count: 0,
      created_by: req.user.id,
      created_at: undefined,
      updated_at: undefined,
    };

    const { data: newTemplate, error: createError } = await supabase
      .from("agent_templates")
      .insert(duplicatedTemplate)
      .select(
        `
        *,
        profiles!created_by (
          full_name,
          email
        )
      `,
      )
      .single();

    if (createError) {
      console.error("Error duplicating template:", createError);
      return res.status(500).json({ error: "Failed to duplicate template" });
    }

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error in duplicateTemplate:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const setupTemplateRoutes = (app: Express) => {
  // All template routes require admin authentication
  app.use("/api/admin/templates", adminOnly);

  app.get("/api/admin/templates", getTemplates);
  app.post("/api/admin/templates", createTemplate);
  app.put("/api/admin/templates/:id", updateTemplate);
  app.delete("/api/admin/templates/:id", deleteTemplate);
  app.post("/api/admin/templates/:id/duplicate", duplicateTemplate);
  app.get("/api/admin/templates/stats", getTemplateStats);
  app.post("/api/admin/templates/bulk-update", bulkUpdateTemplates);
};
