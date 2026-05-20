import { Express, Request, Response, Router } from "express";
import { supabase } from "../utils/supabaseClient";

const router = Router();

const isBlogTableMissingError = (error: any) =>
  error?.code === "PGRST205" ||
  error?.message?.includes("Could not find the table 'public.blog_posts'");

const handleMissingTableError = (res: Response) =>
  res.status(500).json({
    error:
      "Supabase table blog_posts is missing. Run the blog_posts migration or create the table in your Supabase project.",
  });

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      if (isBlogTableMissingError(error)) {
        return handleMissingTableError(res);
      }
      throw error;
    }

    return res.json(data ?? []);
  } catch (error) {
    console.error("Blog list error:", error);
    if (isBlogTableMissingError(error)) {
      return handleMissingTableError(res);
    }
    return res.status(500).json({ error: "Failed to load blog posts" });
  }
});

router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
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

    return res.json(data);
  } catch (error) {
    console.error("Blog detail error:", error);
    return res.status(500).json({ error: "Failed to load blog post" });
  }
});

export const setupBlogRoutes = (app: Express) => {
  app.use("/api/blogs", router);
};
