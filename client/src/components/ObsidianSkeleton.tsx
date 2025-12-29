export default function ObsidianSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 font-sans">
      <nav className="border-b border-white/10 bg-[#0A0A0A] h-16">
        <div className="max-w-6xl mx-auto px-8 h-full">
          <div className="flex items-center justify-between gap-4 h-full">
            <div className="flex items-center gap-8">
              <div className="h-6 w-28 bg-slate-800 rounded animate-slow-pulse" />
              
              <div className="flex items-center gap-2">
                <div className="h-9 w-24 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-24 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-20 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-20 bg-slate-800/50 rounded-md animate-slow-pulse" />
              </div>
            </div>

            <div className="h-4 w-12 bg-slate-800/50 rounded animate-slow-pulse" />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-8">
        <div className="space-y-8">
          <div className="flex items-baseline justify-between gap-4">
            <div className="h-8 w-56 bg-slate-800 rounded animate-slow-pulse" />
            <div className="h-4 w-40 bg-slate-800/50 rounded animate-slow-pulse" />
          </div>

          <div className="h-[200px] flex flex-col items-center justify-center space-y-4">
            <div className="text-center space-y-2">
              <div className="h-4 w-40 mx-auto bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-16 w-72 mx-auto bg-slate-800 rounded animate-slow-pulse" />
            </div>
            <div className="text-center space-y-2 pt-4">
              <div className="h-4 w-36 mx-auto bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-10 w-48 mx-auto bg-slate-800 rounded animate-slow-pulse" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 border-t border-white/5 pt-6">
            <div className="text-center space-y-2">
              <div className="h-4 w-20 mx-auto bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-6 w-12 mx-auto bg-slate-800 rounded animate-slow-pulse" />
            </div>
            <div className="text-center space-y-2">
              <div className="h-4 w-16 mx-auto bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-6 w-10 mx-auto bg-slate-800 rounded animate-slow-pulse" />
            </div>
            <div className="text-center space-y-2">
              <div className="h-4 w-16 mx-auto bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-6 w-20 mx-auto bg-slate-800 rounded animate-slow-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="h-4 w-32 bg-slate-800/50 rounded animate-slow-pulse" />
                <div className="h-3 w-24 bg-slate-800/30 rounded animate-slow-pulse" />
              </div>
              <div className="h-[280px] bg-slate-800/20 rounded animate-slow-pulse" />
            </div>

            <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="h-4 w-28 bg-slate-800/50 rounded animate-slow-pulse" />
                <div className="h-3 w-20 bg-slate-800/30 rounded animate-slow-pulse" />
              </div>
              <div className="h-[220px] bg-slate-800/20 rounded animate-slow-pulse" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
