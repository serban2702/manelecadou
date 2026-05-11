import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { AdminGuard } from '../../common/admin.guard';
import {
  AiAssistantService,
  type AssistantContextKind,
  type AssistantOp,
} from './ai-assistant.service';

class ContextDto {
  @IsIn(['mail', 'chat']) kind!: AssistantContextKind;
  @IsString() refId!: string;
  @IsOptional() @IsString() forceTargetLang?: string;
}

class TurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() content!: string;
}

class AssistantChatDto {
  @ValidateNested() @Type(() => ContextDto) context!: ContextDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TurnDto) history!: TurnDto[];
  @IsString() @MinLength(1) message!: string;
  @IsOptional() @IsIn(['reply', 'reformulate', 'fix-grammar', 'shorten', 'expand']) op?: AssistantOp;
}

@UseGuards(AdminGuard)
@Controller('admin/ai-assistant')
export class AiAssistantController {
  constructor(private readonly svc: AiAssistantService) {}

  @Post('chat')
  async chat(@Body() dto: AssistantChatDto) {
    return this.svc.run({
      context: dto.context,
      history: dto.history,
      message: dto.message,
      op: dto.op,
    });
  }
}
