export default function DashboardLoading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
      <div className="relative w-16 h-16 mb-5">
        {/* Spinning ring */}
        <svg className="animate-spin w-16 h-16" viewBox="0 0 64 64" fill="none">
          <circle
            cx="32" cy="32" r="28"
            stroke="#e4e6eb"
            strokeWidth="4"
          />
          <circle
            cx="32" cy="32" r="28"
            stroke="#2a5fd0"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="60 120"
            strokeDashoffset="0"
          />
        </svg>
        {/* Center logo dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[var(--accent)] text-xl leading-none">◆</span>
        </div>
      </div>
      <p className="text-[14px] text-[#5b5f6a] font-medium">Loading your dashboard...</p>
    </div>
  );
}
