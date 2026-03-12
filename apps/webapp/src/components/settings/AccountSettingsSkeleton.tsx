function AccountSettingsSkeleton(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse motion-reduce:animate-none" />
        </div>
        {/* Profile section skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-24 bg-muted rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-5 w-48 bg-muted rounded animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        {/* Actions skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-10 w-full bg-muted rounded animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    </main>
  )
}

export { AccountSettingsSkeleton }
