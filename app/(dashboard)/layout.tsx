import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 px-5 py-5 sm:px-7 sm:py-5.5 max-w-full overflow-x-hidden flex flex-col">
        <div className="flex-1">{children}</div>
        <ChatPanel />
      </div>
    </div>
  );
}
