import { useQuery } from "@tanstack/react-query";

interface EntityPropertyCount {
  count: number;
  properties: Array<{
    id: string;
    name: string;
  }>;
}

export function useEntityPropertyCount(entityId: string | undefined) {
  return useQuery<EntityPropertyCount>({
    queryKey: ["/api/entities", entityId, "property-count"],
    enabled: !!entityId,
    retry: false,
  });
}