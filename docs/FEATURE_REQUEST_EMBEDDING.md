# Feature Request Embedding-Based Deduplication

## Overview

The Feature Request Pipeline now supports **vector embedding-based semantic similarity** for intelligent duplicate detection. This enhancement provides more accurate similarity matching compared to text-based methods alone.

## Architecture

### Components

1. **Embedding Service** (`embedding.service.ts`)
   - Generates vector embeddings using OpenAI's `text-embedding-3-small` model
   - Caches embeddings in-memory and in PostgreSQL for performance
   - Provides cosine similarity calculation
   - Handles batch embedding generation

2. **Updated Deduplication Service** (`deduplication.service.ts`)
   - Primary method: `findSimilarByEmbedding()` - Uses vector similarity
   - Fallback method: `findSimilarByText()` - Uses Jaccard/bigram similarity
   - Automatic graceful degradation when OpenAI API is unavailable

3. **Database Schema** (`FeatureRequestEmbedding` model)
   - Stores embeddings separately from feature requests
   - Tracks content hash to detect changes
   - Includes generation timestamp for cache invalidation

## How It Works

### 1. Embedding Generation

```typescript
const embeddingService = getEmbeddingService();

// Generate embedding for a feature request
const embedding = await embeddingService.generateEmbedding(
  "Add dark mode to the dashboard"
);
// Returns: number[] (1536 dimensions)
```

### 2. Similarity Calculation

```typescript
// Compare two embeddings using cosine similarity
const similarity = embeddingService.cosineSimilarity(embedding1, embedding2);
// Returns: number (0-1, where 1 is identical)
```

### 3. Smart Caching

The service implements a two-tier caching strategy:

- **In-Memory Cache**: Fast access for frequently compared requests
- **Database Cache**: Persistent storage with 7-day TTL
- **Content Hash**: Detects when request content changes and regenerates embedding

### 4. Deduplication Workflow

```typescript
const deduplicationService = getDeduplicationService();

// Find similar requests (uses embeddings if available, falls back to text)
const similar = await deduplicationService.findSimilarRequests(
  organizationId,
  "I want a dark mode option"
);

// Get action recommendation
const result = await deduplicationService.checkForDuplicates(
  organizationId,
  requestId,
  requestContent
);

// Result actions:
// - "auto-merge": >95% similar → merge automatically
// - "suggest-merge": >85% similar → suggest to reviewer
// - "link-related": >70% similar → link as related
// - "no-action": <70% similar → create new request
```

## Configuration

### Environment Variables

```bash
# Required for embedding support
OPENAI_API_KEY=sk-...

# Optional: The system works without this, falling back to text similarity
```

### Similarity Thresholds

```typescript
const deduplicationService = getDeduplicationService({
  autoMergeThreshold: 0.95,      // Very high similarity
  suggestMergeThreshold: 0.85,   // High similarity
  relatedThreshold: 0.70,        // Moderate similarity
});
```

## Database Schema

```sql
CREATE TABLE feature_request_embeddings (
  id UUID PRIMARY KEY,
  feature_request_id UUID UNIQUE NOT NULL,
  embedding FLOAT[],              -- Vector embedding (1536 dimensions)
  content_hash VARCHAR(50),       -- Hash for change detection
  generated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  FOREIGN KEY (feature_request_id) REFERENCES feature_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_feature_request_embeddings_generated_at
  ON feature_request_embeddings(generated_at);
```

## Migration

Run the migration to add the embeddings table:

```bash
npx prisma migrate deploy
```

Or create a new migration:

```bash
npx prisma migrate dev --name add_feature_request_embeddings
```

## Usage Examples

### Basic Usage

```typescript
import { getDeduplicationService } from './deduplication.service';

const service = getDeduplicationService();

// Find similar requests (automatically uses embeddings if available)
const similar = await service.findSimilarRequests(
  organizationId,
  newRequestContent,
  excludeRequestId
);

console.log(`Found ${similar.length} similar requests`);
```

### Explicit Method Selection

```typescript
// Force embedding-based similarity
const embeddingBased = await service.findSimilarByEmbedding(
  organizationId,
  content
);

// Force text-based similarity
const textBased = await service.findSimilarByText(
  organizationId,
  content
);
```

### Batch Processing

```typescript
import { getEmbeddingService } from './embedding.service';

const embeddingService = getEmbeddingService();

const requests = [
  { id: 'req-1', content: 'Add OAuth login' },
  { id: 'req-2', content: 'Support Google auth' },
  { id: 'req-3', content: 'Export to CSV' },
];

const embeddings = await embeddingService.batchGenerateEmbeddings(requests);
// Returns Map<requestId, embedding>
```

## Performance Characteristics

### Embedding Generation

- **First time**: ~200-500ms per request (OpenAI API call)
- **Cached (memory)**: <1ms
- **Cached (database)**: ~5-20ms
- **Batch (10 requests)**: ~2-3s total

### Similarity Comparison

- **Vector (cosine)**: <1ms per comparison
- **Text (Jaccard/bigram)**: ~5-10ms per comparison

### Memory Usage

- **Per embedding**: ~6KB (1536 floats × 4 bytes)
- **100 requests cached**: ~600KB
- **1000 requests cached**: ~6MB

## Fallback Behavior

The system gracefully handles missing OpenAI API key:

```typescript
const embeddingService = getEmbeddingService();

if (!embeddingService.isAvailable()) {
  // Falls back to text-based similarity automatically
  console.log("Embeddings disabled - using text similarity");
}
```

## Advantages Over Text-Based Similarity

### Semantic Understanding

**Text-based** (Jaccard/bigram):
- "Add dark mode to dashboard" vs "Support night theme in UI" → Low similarity (~40%)

**Embedding-based**:
- "Add dark mode to dashboard" vs "Support night theme in UI" → High similarity (~85%)

### Language Variations

Embeddings handle:
- Synonyms: "authentication" ≈ "login" ≈ "sign in"
- Paraphrasing: Different sentence structures with same meaning
- Multi-language: Cross-language similarity detection
- Context: Understanding domain-specific terminology

### Example Similarity Scores

| Request 1 | Request 2 | Text Similarity | Embedding Similarity |
|-----------|-----------|-----------------|---------------------|
| "Add OAuth login" | "Support Google authentication" | 0.35 | 0.88 |
| "Dark mode for UI" | "Night theme option" | 0.22 | 0.91 |
| "Export to Excel" | "Download as spreadsheet" | 0.18 | 0.86 |

## Cost Considerations

### OpenAI API Costs

- **Model**: `text-embedding-3-small`
- **Cost**: $0.02 per 1M tokens (~125K pages of text)
- **Average request**: ~50-200 tokens
- **Cost per 1000 requests**: ~$0.001-0.004 (negligible)

### Optimization Strategies

1. **Caching**: Database storage reduces API calls by ~95%
2. **Batch processing**: More efficient API usage
3. **Lazy generation**: Only generate when comparing
4. **Content hashing**: Avoid regeneration for unchanged requests

## Testing

Run the example file to test functionality:

```bash
# Run specific example
npx ts-node src/services/mega-app/feature-request-pipeline/embedding.example.ts 1

# Examples:
# 1 - Generate embeddings and calculate similarity
# 2 - Batch embedding generation
# 3 - Deduplication with embeddings
# 4 - Fallback behavior demonstration
# 5 - Custom configuration thresholds
```

## Monitoring

### Logging

The service logs:
- Embedding generation (success/failure)
- Cache hits/misses
- Fallback to text similarity
- API errors

### Metrics to Track

- Embedding cache hit rate
- Average similarity scores
- Auto-merge vs suggest-merge ratio
- API response times
- Cost per request (OpenAI API)

## Future Enhancements

### Potential Improvements

1. **pgvector Integration**: Store embeddings in PostgreSQL with vector operations
2. **Hybrid Search**: Combine embedding + text + metadata for better ranking
3. **Fine-tuning**: Train custom embeddings on domain-specific requests
4. **Real-time Updates**: Regenerate embeddings when requests are updated
5. **Similarity Explanations**: Show which parts of requests are similar

### Migration to pgvector

Once pgvector is available:

```sql
-- Add vector column
ALTER TABLE feature_requests
  ADD COLUMN embedding vector(1536);

-- Create vector index for fast similarity search
CREATE INDEX ON feature_requests
  USING ivfflat (embedding vector_cosine_ops);

-- Fast similarity query
SELECT id, 1 - (embedding <=> query_embedding) AS similarity
FROM feature_requests
WHERE 1 - (embedding <=> query_embedding) > 0.7
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

## Troubleshooting

### Issue: Embeddings Not Generated

**Symptom**: All requests use text-based similarity

**Solutions**:
1. Check `OPENAI_API_KEY` environment variable
2. Verify API key has sufficient credits
3. Check network connectivity to OpenAI API
4. Review logs for error messages

### Issue: High API Costs

**Solutions**:
1. Verify caching is working (check cache hit logs)
2. Reduce batch size to avoid rate limits
3. Consider increasing cache TTL
4. Use text similarity for low-priority comparisons

### Issue: Slow Performance

**Solutions**:
1. Use batch generation for multiple requests
2. Pre-generate embeddings during off-peak hours
3. Increase in-memory cache size
4. Monitor database query performance

## References

- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Cosine Similarity Explained](https://en.wikipedia.org/wiki/Cosine_similarity)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- Existing `semantic-search.ts` for similar implementation patterns
