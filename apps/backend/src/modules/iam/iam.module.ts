import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthSessionCleanupService } from "./auth/auth-session-cleanup.service";
import { AuthSession } from "./auth/auth-session.entity";
import { AuthController } from "./auth/auth.controller";
import { AuthPermissionCacheService } from "./auth/auth-permission-cache.service";
import { AuthService } from "./auth/auth.service";
import { JwtRefreshStrategy } from "./auth/jwt-refresh.strategy";
import { JwtStrategy } from "./auth/jwt.strategy";
import { LoginRateLimitService } from "./auth/login-rate-limit.service";
import { Permission } from "./permissions/permission.entity";
import { PermissionsController } from "./permissions/permissions.controller";
import { PermissionsService } from "./permissions/permissions.service";
import { Profile } from "./profiles/profile.entity";
import { ProfilesController } from "./profiles/profiles.controller";
import { ProfilesService } from "./profiles/profiles.service";
import { Role } from "./roles/role.entity";
import { RolesController } from "./roles/roles.controller";
import { RolesService } from "./roles/roles.service";
import { User } from "./users/user.entity";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Profile, Role, Permission, AuthSession]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [
    AuthController,
    UsersController,
    RolesController,
    PermissionsController,
    ProfilesController,
  ],
  providers: [
    AuthService,
    AuthPermissionCacheService,
    AuthSessionCleanupService,
    JwtStrategy,
    JwtRefreshStrategy,
    LoginRateLimitService,
    UsersService,
    RolesService,
    PermissionsService,
    ProfilesService,
  ],
})
export class IamModule {}
