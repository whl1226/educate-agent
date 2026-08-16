import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeChunk, KnowledgePoint, Question, TextbookContent, Template, KnowledgeBaseEntry } from '../../db/entities/knowledge.entities';
import { HybridRetriever } from './hybrid-retriever';
import { OpenAiEmbedding, HashEmbedding, type EmbeddingProvider } from './embedding';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunk, KnowledgePoint, Question, TextbookContent, Template, KnowledgeBaseEntry])],
  providers: [
    HybridRetriever,
    {
      provide: 'EMBEDDING_PROVIDER',
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmbeddingProvider => {
        const mode = config.get<string>('EMBEDDING_PROVIDER', 'hash');
        if (mode === 'openai-compatible' && config.get<string>('EMBEDDING_API_KEY')) {
          return new OpenAiEmbedding(
            config.get<string>('EMBEDDING_BASE_URL') || 'https://api.dashscope.aliyuncs.com/compatible-mode/v1',
            config.get<string>('EMBEDDING_API_KEY')!,
            config.get<string>('EMBEDDING_MODEL') || 'text-embedding-v3',
          );
        }
        return new HashEmbedding();
      },
    },
  ],
  exports: [HybridRetriever, 'EMBEDDING_PROVIDER'],
})
export class KnowledgeModule {}
