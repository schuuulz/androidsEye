import { useState } from "react";
import { Link2Off } from "lucide-react";
import { toast } from "sonner";
import { api, notifyError } from "../lib/api";
import { deviceName, type Device } from "../lib/types";
import { expectDeparture } from "../hooks/useDevices";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Checkbox } from "./ui/Checkbox";

interface UnpairDialogProps {
  device: Device;
  open: boolean;
  onClose: () => void;
}

export function UnpairDialog({ device, open, onClose }: UnpairDialogProps) {
  const [disableOnPhone, setDisableOnPhone] = useState(true);
  const name = deviceName(device);
  // Só dá para mexer nas configurações do celular enquanto ele responde.
  const canReachPhone = device.state === "online";

  const unpair = async () => {
    try {
      expectDeparture(device.id);
      await api.unpairDevice(device.serial, canReachPhone && disableOnPhone);
      toast.success(`${name} despareado`, {
        description: "Para tirar este computador da lista do celular: Depuração por Wi-Fi › Dispositivos pareados.",
      });
      onClose();
    } catch (error) {
      notifyError(error, `Não foi possível desparear ${name}`);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={unpair}
      icon={<Link2Off className="size-[18px]" />}
      title={`Desparear ${name}?`}
      confirmLabel="Desparear"
      description={
        <>
          Este computador deixa de se conectar automaticamente a ele. Para conectar de novo, será preciso parear
          outra vez.
        </>
      }
    >
      {canReachPhone && (
        <Checkbox
          checked={disableOnPhone}
          onChange={setDisableOnPhone}
          label="Também desativar a Depuração por Wi-Fi no celular"
          description="Recomendado: garante que nenhuma conexão sem fio continue aberta."
        />
      )}
    </ConfirmDialog>
  );
}
