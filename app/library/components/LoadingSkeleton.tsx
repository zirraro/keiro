export default function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {/* Image skeleton */}
            <div className="aspect-square bg-neutral-200" />

            {/* Content skeleton */}
            <div className="p-3 space-y-2">
              <div className="h-4 bg-neutral-200 rounded w-3/4" />
              <div className="h-3 bg-neutral-200 rounded w-1/2" />
              <div className="h-3 bg-neutral-200 rounded w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
