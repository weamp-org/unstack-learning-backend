import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateSubjectDto } from './create-subject.dto.js';

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {
  @ApiProperty({ example: true, required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
