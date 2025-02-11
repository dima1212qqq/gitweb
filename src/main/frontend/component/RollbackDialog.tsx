import { useState } from "react";
import { Button, Checkbox, Dialog, VerticalLayout } from "@vaadin/react-components";
import { GitEndpoint } from "Frontend/generated/endpoints";

interface RollbackDialogProps {
    isOpen: boolean;
    onClose: () => void;
    commitHash: string;
    changeList: string[];
}

export default function RollbackDialog({ isOpen, onClose, commitHash, changeList }: RollbackDialogProps) {
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

    const handleCheckboxChange = (file: string) => {

        setSelectedFiles(prev =>
            prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]
        );
        console.log(commitHash)
        console.log(changeList)

    };

    const handleRestore = () => {
        if (selectedFiles.length === 0) {
            alert("Выберите файлы для отката!");
            return;
        }

        GitEndpoint.restoreFiles(commitHash, selectedFiles)
            .then((message: string) => {
                alert(message);
                onClose();
            })
            .catch((error: any) => {
                console.error("Ошибка при откате файлов:", error);
                alert("Ошибка: " + error.message);
            });
        console.log(commitHash)
        console.log(changeList)
    };

    return (
        <Dialog opened={isOpen} onOpenedChanged={({ detail }) => !detail.value && onClose()}>
            <VerticalLayout>
                <h3>Выберите файлы для отката</h3>
                {changeList.map((file: string) => (
                    <Checkbox
                        label={file}
                        key={file}
                        checked={selectedFiles.includes(file)}
                        onCheckedChanged={() => handleCheckboxChange(file)}
                    >
                        {file}
                    </Checkbox>
                ))}
                <Button theme="primary" onClick={handleRestore}>
                    Откатить выбранные файлы
                </Button>
            </VerticalLayout>
        </Dialog>
    );
}
