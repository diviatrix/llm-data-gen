## Examples

### JSON Format (Structured Data)

Generate validated, structured data with JSON schemas:

#### Quiz Questions
```bash
llmdatagen --config configs/examples/quiz.json
```
- Multiple choice questions with 2-4 answers
- Difficulty levels and tags
- Schema validation

#### Product Catalog
```bash
llmdatagen --config configs/examples/products.json
```
- E-commerce product listings
- SKU, pricing, inventory
- Structured metadata

#### Blog Article Metadata
```bash
llmdatagen --config configs/examples/articles.json
```
- Article metadata and summaries
- Author, tags, featured flags
- Publication dates

#### News Digest (Web Search)
```bash
llmdatagen --config configs/examples/news-digest.json
```
- Real-time news search and analysis
- Actual sources, URLs, dates
- Relevance scoring and sentiment
- Uses models with web search capabilities

### Text Format (Freeform Content)

Generate any text format without schema constraints:

#### Blog Posts (Markdown)
```bash
llmdatagen --config configs/examples/blog-posts.json
```
- Full blog articles in Markdown
- Headings, formatting, structure
- 800+ words per article

#### Email Templates
```bash
llmdatagen --config configs/examples/emails.json
```
- Professional email templates
- Business, sales, support styles
- Customizable tone and purpose

#### CSV Data
```bash
llmdatagen --config configs/examples/csv-data.json
```
- Comma-separated data files
- Custom columns and headers
- Realistic data generation

#### News Digest (Markdown)
```bash
llmdatagen --config configs/examples/news-digest-markdown.json
```
- Real-time web search for news
- Professional digest format
- Executive summaries & trend analysis
- Uses models with web search capabilities


