import { Toaster } from "sonner";
import { useDependencies } from "./hooks/useDependencies";
import { DependencyGate } from "./components/DependencyGate";
import { DeviceHub } from "./components/DeviceHub";

export default function App() {
  const { report, checking, recheck } = useDependencies();

  return (
    <>
      <DependencyGate report={report} checking={checking} onRecheck={recheck}>
        <DeviceHub />
      </DependencyGate>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!bg-elevated !border-line !rounded-xl !shadow-2xl !shadow-black/50",
            description: "!text-zinc-400",
          },
        }}
      />
    </>
  );
}
