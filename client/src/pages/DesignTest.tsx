export default function DesignTest() {
  return (
    <div className="min-h-screen bg-obsidian text-slate-200 font-sans p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 
            className="text-4xl font-semibold tracking-tight"
            data-testid="text-header-title"
          >
            Forensic Audit
          </h1>
          <p className="text-slate-400 mt-2">
            PHANTOM Design System Verification
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Revenue Metrics</h2>
          
          <div className="bg-slate-900 border border-white/10 rounded-md p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Recovered Revenue</span>
              <span 
                className="font-mono text-2xl text-emerald-500"
                data-testid="text-recovered-revenue"
              >
                £4,200.50
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Shadow Revenue (Leaked)</span>
              <span 
                className="font-mono text-2xl text-slate-400"
                data-testid="text-leaked-revenue"
              >
                £12,500.00
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Typography Test</h2>
          
          <div className="bg-slate-900 border border-white/10 rounded-md p-6 space-y-4">
            <div>
              <p className="text-sm text-slate-400 mb-1">Sans (Inter) - Interface Prose</p>
              <p className="font-sans text-lg">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
            
            <div>
              <p className="text-sm text-slate-400 mb-1">Mono (JetBrains Mono) - Numerical Data</p>
              <p className="font-mono text-lg">
                £1,234.56 | 87.5% | 2024-01-15 14:30:00
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Action Buttons</h2>
          
          <div className="flex flex-wrap gap-4">
            <button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              data-testid="button-primary-action"
            >
              Start Audit
            </button>
            
            <button 
              className="border border-white/10 text-slate-200 px-6 py-2 rounded-md font-medium hover:bg-white/5 transition-colors"
              data-testid="button-secondary-action"
            >
              View Details
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Color Palette</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="h-16 bg-obsidian border border-white/10 rounded-md"></div>
              <p className="text-sm text-slate-400">Obsidian #0A0A0B</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 bg-slate-900 border border-white/10 rounded-md"></div>
              <p className="text-sm text-slate-400">Slate-900</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 bg-indigo-600 rounded-md"></div>
              <p className="text-sm text-slate-400">Indigo-600</p>
            </div>
            <div className="space-y-2">
              <div className="h-16 bg-emerald-500 rounded-md"></div>
              <p className="text-sm text-slate-400">Emerald-500</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
