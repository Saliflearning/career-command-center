import http from "node:http";

describe("SupabaseStorageAdapter", () => {
  it("uses HTTP and preserves a custom port for local Supabase", async () => {
    const uploaded: Buffer[] = [];
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        if (request.url?.startsWith("/storage/v1/object/sign/")) {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({
            signedURL: "/storage/v1/object/sign/resume-files/eval/resume.pdf?token=eval",
          }));
          return;
        }

        uploaded.push(Buffer.concat(chunks));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("{}");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server");

    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "eval-service-role-key";

    try {
      const { SupabaseStorageAdapter } = await import("./supabase");
      const adapter = new SupabaseStorageAdapter();
      const signedUrl = await adapter.upload(
        "eval/resume.pdf",
        Buffer.from("local-eval-pdf"),
        "application/pdf"
      );

      expect(uploaded).toEqual([Buffer.from("local-eval-pdf")]);
      expect(signedUrl).toContain("127.0.0.1");
      expect(signedUrl).toContain("token=eval");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
