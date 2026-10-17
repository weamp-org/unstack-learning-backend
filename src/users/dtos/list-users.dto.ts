import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { UserRole } from '../../generated/prisma/enums.js';

export class ListUsersDto {
  /** Case-insensitive match against name and email. Omit to list all users.
   * @example 'ama'
   */
  @ApiProperty({ required: false, example: 'ama' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  q?: string;

  /** Only users with this role. Omit for all roles.
   * @example 'TEACHER'
   */
  @ApiProperty({ enum: UserRole, required: false, example: UserRole.TEACHER })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
