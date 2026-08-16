import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  task: string;
}

export class AgentRunsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
