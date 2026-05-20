import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { providers } from "./providers";
import { searchCache } from "./cache";
import { BookSearchResult, ProviderResponse } from "./types";
import axios from "axios";
import crypto from "node:crypto";

export async function searchRoutes(fastify: FastifyInstance) {
  
  fastify.get("/search", async (request: FastifyRequest<{ Querystring: { q: string, page?: string } }>, reply) => {
    const { q, page = "1" } = request.query;
    if (!q) {
      return reply.code(400).send({ error: "Query parameter 'q' is required" });
    }

    const pageNum = parseInt(page) || 1;
    const cacheKey = `search:${q}:${pageNum}`;
    const cached = searchCache.get<ProviderResponse>(cacheKey);
    
    console.log(`[SEARCH_REQUEST] q=${q} page=${pageNum}`);

    if (cached) {
      console.log(`[SEARCH_RESPONSE] Cache hit for ${cacheKey}`);
      return cached;
    }

    try {
      const resultsArray = await Promise.allSettled(providers.map(p => p.search(q, pageNum)));
      
      const combinedResults: BookSearchResult[] = [];
      let totalCount = 0;
      
      const seen = new Set<string>();

      for (let i = 0; i < resultsArray.length; i++) {
        const res = resultsArray[i];
        const providerName = providers[i].name;

        if (res.status === 'fulfilled') {
          const data = res.value;
          totalCount += data.total || 0;
          for (const book of data.results) {
            const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
            if (!seen.has(key)) {
              seen.add(key);
              combinedResults.push(book);
            } else {
              const existing = combinedResults.find(b => `${b.title.toLowerCase()}|${b.author.toLowerCase()}` === key);
              if (existing) {
                const existingFormatTypes = new Set(existing.formats.map(f => f.type));
                for (const format of book.formats) {
                  if (!existingFormatTypes.has(format.type)) {
                    existing.formats.push(format);
                  }
                }
              }
            }
          }
        } else {
          console.error(`[SEARCH_PROVIDER_ERROR] ${providerName}:`, res.reason);
        }
      }

      console.log(`[SEARCH_FINAL_RESULTS] count=${combinedResults.length}`);
      
      const response: ProviderResponse = {
        results: combinedResults,
        total: totalCount,
        nextPageToken: String(pageNum + 1),
      };

      searchCache.set(cacheKey, response, 1800);
      return response;
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  fastify.get("/book/:id", async (request: FastifyRequest<{ Params: { id: string }, Querystring: { provider?: string } }>, reply) => {
    const { id } = request.params;
    const { provider } = request.query;

    let prov = providers.find(p => p.name.toLowerCase() === provider?.toLowerCase());
    
    console.log(`[BOOK_DETAIL_REQUEST] provider=${provider} id=${id}`);
    if (!prov) {
       return reply.code(400).send({ error: "Missing or invalid 'provider' query parameter" });
    }

    const cacheKey = `book:${prov.name}:${id}`;
    const cached = searchCache.get<BookSearchResult>(cacheKey);
    if (cached) return cached;

    try {
      const book = await prov.getBookDetails(id);
      if (!book) {
        return reply.code(404).send({ error: "Book not found" });
      }
      
      searchCache.set(cacheKey, book, 3600 * 24);
      return book;
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  fastify.get("/download/:provider/:id", async (request: FastifyRequest<{ Params: { provider: string, id: string }, Querystring: { format?: string, traceId?: string } }>, reply) => {
    const { provider, id } = request.params;
    const { format = "epub", traceId = "no-trace" } = request.query;

    try {
      console.log(`[TRACE][${traceId}][START] provider=${provider} id=${id} format=${format}`);
      
      const prov = providers.find(p => p.name.toLowerCase() === provider.toLowerCase());
      if (!prov) {
        console.error(`[TRACE][${traceId}][PROVIDER_NOT_FOUND] ${provider}`);
        return reply.code(404).send({ error: "Provider not found" });
      }

      console.log(`[TRACE][${traceId}][RESOLVING_DETAILS]`);
      const book = await prov.getBookDetails(id);
      
      if (!book) {
        console.error(`[TRACE][${traceId}][BOOK_NOT_FOUND] ${id} via ${provider}`);
        return reply.code(404).send({ error: "Book not found" });
      }

      let fileFormat = book.formats.find(f => f.type === format);
      
      if (!fileFormat && book.formats.length > 0) {
        fileFormat = book.formats[0];
      }

      if (!fileFormat || !fileFormat.downloadUrl) {
        console.error(`[TRACE][${traceId}][FORMAT_UNAVAILABLE] ${format}`);
        return reply.code(400).send({ 
          error: "FORMAT_UNAVAILABLE", 
          message: `The requested format ${format} is not available for this book.`,
          availableFormats: book.formats.map(f => f.type)
        });
      }

      const finalAssetUrl = fileFormat.downloadUrl;
      console.log(`[TRACE][${traceId}][FINAL_ASSET_URL] ${finalAssetUrl}`);

      try {
        console.log(`[TRACE][${traceId}][FETCH_START]`);
        const response = await axios({
          method: 'get',
          url: finalAssetUrl,
          responseType: 'stream',
          timeout: 45000,
          maxRedirects: 10,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://archive.org/'
          },
          validateStatus: (status) => status < 400
        } as any) as any;

        const contentType = (response.headers["content-type"] || "").toLowerCase();
        const finalUrl = response.request.res.responseUrl || finalAssetUrl;
        
        console.log(`[TRACE][${traceId}][FETCH_RESPONSE]`, {
          status: response.status,
          contentType,
          finalUrl,
          redirected: response.request.res.redirects?.length > 0
        });

        const stream = response.data as any;
        
        return new Promise((resolve, reject) => {
          stream.once('data', (chunk: Buffer) => {
            const head = chunk.slice(0, 500).toString(); 
            const headLower = head.toLowerCase();
            const isHtmlHead = headLower.includes('<!doc') || headLower.includes('<html') || headLower.includes('<head');
            const isJsonHead = head.trim().startsWith('{') || head.trim().startsWith('[');
            
            console.log(`[TRACE][${traceId}][MAGIC_BYTES_PEEK] head_excerpt=${head.substring(0, 100).replace(/\n/g, ' ')}`);

            if (isHtmlHead || isJsonHead || contentType.includes('text/html') || contentType.includes('application/json')) {
              console.error(`[TRACE][${traceId}][INVALID_CONTENT] Found ${isHtmlHead ? 'HTML' : (isJsonHead ? 'JSON' : 'WRONG_TYPE')} at head.`);
              
              reply.code(502).send({
                error: "INVALID_BINARY_CONTENT",
                message: "The provider returned a document/page instead of a file.",
                traceId,
                finalUrl,
                contentType,
                headPreview: head.substring(0, 500)
              });
              stream.destroy();
              resolve(void 0);
              return;
            }

            console.log(`[TRACE][${traceId}][STREAM_START]`);

            reply.header("Content-Type", contentType || (fileFormat!.type === 'pdf' ? 'application/pdf' : 'application/epub+zip'));
            if (response.headers["content-length"]) {
              reply.header("Content-Length", response.headers["content-length"]);
            }
            reply.header("Content-Disposition", `attachment; filename="${book.title}.${fileFormat!.type}"`);
            reply.header("X-Trace-Id", traceId);
            reply.header("Cache-Control", "no-cache");
            
            reply.raw.write(chunk);
            stream.pipe(reply.raw);
            
            stream.on('end', () => {
              console.log(`[TRACE][${traceId}][STREAM_END]`);
              resolve(void 0);
            });
            stream.on('error', (err: Error) => {
              console.error(`[TRACE][${traceId}][STREAM_ERROR]`, err);
              resolve(void 0); 
            });
          });

          stream.once('error', (err: Error) => {
            console.error(`[TRACE][${traceId}][STREAM_INIT_ERROR]`, err);
            reject(err);
          });
        });

      } catch (proxyErr: any) {
        console.error(`[TRACE][${traceId}][PROXY_FAIL]`, proxyErr.message);
        return reply.code(502).send({ 
          error: "PROXY_FAILURE", 
          message: "Failed to stream the file from the provider.",
          traceId,
          details: proxyErr.message,
          originalUrl: fileFormat.downloadUrl
        });
      }
    } catch (err: any) {
      console.error(`[TRACE][${traceId}][CRITICAL_FAIL]`, err);
      return reply.code(500).send({
        error: err.message,
        traceId,
        stack: err.stack
      });
    }
  });
}
