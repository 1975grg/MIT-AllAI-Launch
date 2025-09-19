import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";

// Valid user roles for type safety
export type UserRole = 'admin' | 'manager' | 'staff' | 'vendor';

// Extend User type to include required role from organization membership
export interface UserWithRole extends User {
  role: UserRole;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<UserWithRole>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
