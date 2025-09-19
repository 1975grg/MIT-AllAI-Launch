import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";

// Extend User type to include role from organization membership
export interface UserWithRole extends User {
  role?: string;
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
