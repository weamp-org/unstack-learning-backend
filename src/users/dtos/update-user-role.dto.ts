import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { UserRole } from '../../generated/prisma/enums.js';

export class UpdateUserRoleDto {
  /** New role for the user. Any role can be assigned, including demotion
   * back to STUDENT — the endpoint itself is restricted to admins.
   * @example 'TEACHER'
   */
  @ApiProperty({ enum: UserRole, example: UserRole.TEACHER })
  @IsEnum(UserRole)
  role: UserRole;
}
