"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBlogAdminRoutes = void 0;
const express_1 = require("express");
const supabaseClient_1 = require("../utils/supabaseClient");
const adminRoutes_1 = require("./adminRoutes");
const router = (0, express_1.Router)();
const isBlogTableMissingError = (error) => error?.code === "PGRST205" ||
    error?.message?.includes("Could not find the table 'public.blog_posts'");
const handleMissingTableError = (res) => res.status(500).json({
    error: "Supabase table blog_posts is missing. Run the blog_posts migration or create the table in your Supabase project.",
});
const validateBlogPostPayload = (payload) => {
    const errors = [];
    if (!payload || typeof payload !== "object") {
        errors.push("Payload must be a JSON object");
        return errors;
    }
    if (!payload.slug || typeof payload.slug !== "string") {
        errors.push("slug is required and must be a string");
    }
    if (!payload.title || typeof payload.title !== "string") {
        errors.push("title is required and must be a string");
    }
    if (!payload.summary || typeof payload.summary !== "string") {
        errors.push("summary is required and must be a string");
    }
    if (!payload.author || typeof payload.author !== "string") {
        errors.push("author is required and must be a string");
    }
    if (!payload.date || typeof payload.date !== "string") {
        errors.push("date is required and must be a string");
    }
    if (!payload.readingTime || typeof payload.readingTime !== "string") {
        errors.push("readingTime is required and must be a string");
    }
    if (!Array.isArray(payload.tags) ||
        payload.tags.some((tag) => typeof tag !== "string")) {
        errors.push("tags is required and must be an array of strings");
    }
    if (!Array.isArray(payload.sections)) {
        errors.push("sections is required and must be an array");
    }
    return errors;
};
router.get("/blogs", adminRoutes_1.adminOnly, async (_req, res) => {
    try {
        const { data, error } = await supabaseClient_1.supabase
            .from("blog_posts")
            .select("*")
            .order("date", { ascending: false });
        if (error) {
            if (isBlogTableMissingError(error)) {
                return handleMissingTableError(res);
            }
            throw error;
        }
        return res.json(data || []);
    }
    catch (error) {
        console.error("Admin blog list error:", error);
        if (isBlogTableMissingError(error)) {
            return handleMissingTableError(res);
        }
        return res.status(500).json({ error: "Failed to load blog posts" });
    }
});
router.post("/blogs", adminRoutes_1.adminOnly, async (req, res) => {
    try {
        const payload = req.body;
        const validationErrors = validateBlogPostPayload(payload);
        if (validationErrors.length > 0) {
            return res
                .status(400)
                .json({ error: "Validation failed", details: validationErrors });
        }
        const existingPost = await supabaseClient_1.supabase
            .from("blog_posts")
            .select("slug")
            .eq("slug", payload.slug)
            .single();
        if (existingPost.data) {
            return res
                .status(409)
                .json({ error: "Blog post with this slug already exists" });
        }
        const { data, error } = await supabaseClient_1.supabase
            .from("blog_posts")
            .insert({
            slug: payload.slug,
            title: payload.title,
            summary: payload.summary,
            date: payload.date,
            author: payload.author,
            reading_time: payload.readingTime,
            tags: payload.tags,
            sections: payload.sections,
        })
            .single();
        if (error) {
            throw error;
        }
        return res.status(201).json(data);
    }
    catch (error) {
        console.error("Admin create blog error:", error);
        if (isBlogTableMissingError(error)) {
            return handleMissingTableError(res);
        }
        return res.status(500).json({ error: "Failed to create blog post" });
    }
});
router.put("/blogs/:slug", adminRoutes_1.adminOnly, async (req, res) => {
    try {
        const slug = req.params.slug;
        const payload = req.body;
        const validationErrors = validateBlogPostPayload(payload);
        if (validationErrors.length > 0) {
            return res
                .status(400)
                .json({ error: "Validation failed", details: validationErrors });
        }
        const { data, error } = await supabaseClient_1.supabase
            .from("blog_posts")
            .update({
            title: payload.title,
            summary: payload.summary,
            date: payload.date,
            author: payload.author,
            reading_time: payload.readingTime,
            tags: payload.tags,
            sections: payload.sections,
        })
            .eq("slug", slug)
            .single();
        if (error) {
            if (isBlogTableMissingError(error)) {
                return handleMissingTableError(res);
            }
            return res.status(500).json({ error: "Failed to update blog post" });
        }
        if (!data) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        return res.json(data);
    }
    catch (error) {
        console.error("Admin update blog error:", error);
        if (isBlogTableMissingError(error)) {
            return handleMissingTableError(res);
        }
        return res.status(500).json({ error: "Failed to update blog post" });
    }
});
router.delete("/blogs/:slug", adminRoutes_1.adminOnly, async (req, res) => {
    try {
        const slug = req.params.slug;
        const { data, error } = await supabaseClient_1.supabase
            .from("blog_posts")
            .delete()
            .eq("slug", slug)
            .single();
        if (error) {
            if (isBlogTableMissingError(error)) {
                return handleMissingTableError(res);
            }
            if (error.code === "PGRST116" || error.message?.includes("not found")) {
                return res.status(404).json({ error: "Blog post not found" });
            }
            throw error;
        }
        if (!data) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        return res.json({ success: true, slug: data?.slug });
    }
    catch (error) {
        console.error("Admin delete blog error:", error);
        if (isBlogTableMissingError(error)) {
            return handleMissingTableError(res);
        }
        return res.status(500).json({ error: "Failed to delete blog post" });
    }
});
const setupBlogAdminRoutes = (app) => {
    app.use("/api/admin", router);
};
exports.setupBlogAdminRoutes = setupBlogAdminRoutes;
