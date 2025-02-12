import {ViewConfig} from '@vaadin/hilla-file-router/types.js';
import {useEffect, useState} from "react";
import {
    Button, Checkbox, CheckboxGroup, Dialog,
    Grid,
    GridColumn,
    HorizontalLayout,
    VerticalLayout
} from "@vaadin/react-components";
import {DiffEditor} from "@monaco-editor/react";
import {useMediaQuery} from "react-responsive";
import {motion, AnimatePresence} from "framer-motion";
import {GitEndpoint} from "Frontend/generated/endpoints";

type FileVersions = {
    original: string;
    modified: string;
};
type CommitData = {
    commitHash: string;
    message: string;
    date: string;
    files?: string[]; // Добавляем поддержку списка изменённых файлов
};


export const config: ViewConfig = {
    menu: {
        order: 0,
        icon: 'line-awesome/svg/file.svg'
    },
    title: 'Main',
    rolesAllowed: ['ADMIN'],
};

type MobileStep = 'commits' | 'files' | 'editor';


function getLanguageFromFileName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'js':
        case 'jsx':
            return 'javascript';
        case 'ts':
        case 'tsx':
            return 'typescript';
        case 'java':
            return 'java';
        case 'py':
            return 'python';
        case 'html':
            return 'html';
        case 'css':
            return 'css';
        case 'json':
            return 'json';
        default:
            return 'plaintext';
    }
}

export default function MainView() {
    const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
    const [isRollbackDialogOpen, setIsRollbackDialogOpen] = useState(false);
    const [selectedFilesForCommit, setSelectedFilesForCommit] = useState<string[]>([]);
    const [selectedFilesForRollback, setSelectedFilesForRollback] = useState<string[]>([]);
    const [unstagedFiles, setUnstagedFiles] = useState<string[]>([]);
    const [selectedCommit, setSelectedCommit] = useState<CommitData | null>();
    const [commits, setCommits] = useState<CommitData[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>();
    const [changeList, setChangeList] = useState<string[]>([]);
    const [fileVersions, setFileVersions] = useState<FileVersions>({original: "", modified: ""});

    const isMobile = useMediaQuery({query: '(max-width: 768px)'});
    const [mobileStep, setMobileStep] = useState<MobileStep>('commits');

    //
    useEffect(() => {
        const fetchCommits = async () => {
            try {
                // Загружаем список изменённых файлов (незакоммиченные изменения)
                const uncommittedChanges = await GitEndpoint.getUncommittedChanges();
                setUnstagedFiles(uncommittedChanges);

                const unstagedCommit: CommitData = {
                    commitHash: "unstaged",
                    message: "Незакоммиченные изменения",
                    date: "Текущий",
                    files: uncommittedChanges
                };

                // Преобразуем данные в нужный формат
                const rawCommits = await GitEndpoint.getAllCommits();

                const commitsData: CommitData[] = (rawCommits as Record<string, any>[]).map(commit => ({
                    commitHash: commit.commitHash || "unknown",
                    message: commit.message || "Без описания",
                    date: commit.date || "Неизвестно",
                    files: Array.isArray(commit.files) ? commit.files : []
                }));


                setCommits([unstagedCommit, ...commitsData]); // Добавляем "unstaged" в начало
            } catch (error) {
                console.error("Ошибка загрузки коммитов:", error);
            }
        };
        fetchCommits();
    }, []);


    useEffect(() => {
        const fetchChangedFiles = async () => {
            if (!selectedCommit) return;
            try {
                const data = await GitEndpoint.getChangedFiles(selectedCommit.commitHash);
                setChangeList(data);
            } catch (error) {
                console.error("Ошибка загрузки списка изменённых файлов:", error);
            }
        };
        fetchChangedFiles();
    }, [selectedCommit]);

    useEffect(() => {
        const fetchFileVersions = async () => {
            if (!selectedCommit || !selectedFile) return;
            try {
                const data = await GitEndpoint.getFileVersions(selectedCommit.commitHash, selectedFile);
                setFileVersions({
                    original: data.original || "",
                    modified: data.modified || ""
                });
            } catch (error) {
                console.error("Ошибка загрузки содержимого файлов:", error);
            }
        };
        fetchFileVersions();
    }, [selectedCommit, selectedFile]);

    const openCommitDialog = () => {
        setSelectedFilesForCommit(changeList);
        setIsCommitDialogOpen(true);
    };

    const openRollbackDialog = () => {
        setSelectedFilesForRollback(changeList);
        setIsRollbackDialogOpen(true);
    };

    const handleCommit = async () => {
        const message = prompt("Введите сообщение коммита:");
        if (message && selectedFilesForCommit.length > 0) {
            try {
                await GitEndpoint.createCommit(selectedFilesForCommit, message);
                alert("Коммит создан!");
                setIsCommitDialogOpen(false);
                setSelectedCommit(null);
                setUnstagedFiles([]);
                setFileVersions({ original: "", modified: "" });
            } catch (error) {
                console.error("Ошибка создания коммита:", error);
                alert("Ошибка при создании коммита.");
            }
        }
    };

    const handleRollback = async () => {
        if (selectedFilesForRollback.length === 0) return;
        try {
            await GitEndpoint.rollbackChanges(selectedFilesForRollback);
            alert("Файлы откатаны!");

            // ⏳ Перезагружаем незакоммиченные файлы и коммиты
            const uncommittedChanges = await GitEndpoint.getUncommittedChanges();
            setUnstagedFiles(uncommittedChanges);

            const unstagedCommit: CommitData = {
                commitHash: "unstaged",
                message: "Незакоммиченные изменения",
                date: "Текущий",
                files: uncommittedChanges
            };

            const rawCommits = await GitEndpoint.getAllCommits();
            const commitsData: CommitData[] = (rawCommits as Record<string, any>[]).map(commit => ({
                commitHash: commit.commitHash || "unknown",
                message: commit.message || "Без описания",
                date: commit.date || "Неизвестно",
                files: Array.isArray(commit.files) ? commit.files : []
            }));

            setCommits([unstagedCommit, ...commitsData]);
            setSelectedCommit(unstagedCommit); // 🟢 Выбираем "незакоммиченные" после отката
            setChangeList(uncommittedChanges); // 🟢 Обновляем список файлов в Grid

            setIsRollbackDialogOpen(false);
        } catch (error) {
            console.error("Ошибка отката изменений:", error);
            alert("Ошибка при откате изменений.");
        }
    };

    const desktopLayout = (
        <div className="h-full w-full p-m">
            <div className="grid grid-cols-12 gap-4 h-full">
                <div className="col-span-3 bg-white shadow-md rounded-md p-4">
                    <h3 className="font-semibold text-lg mb-2">История</h3>
                    <Grid
                        className="h-full"
                        items={commits}
                        theme="row-stripes"
                        onActiveItemChanged={(e) => {
                            const grid = e.target as any;
                            grid.activeItem = e.detail.value;
                            setSelectedCommit(e.detail.value);
                            setSelectedFile(null);
                            setFileVersions({ original: "", modified: "" });
                            console.log(selectedCommit)

                        }}
                    >
                        <GridColumn header="История" renderer={({ item }) => (
                            <div>
                                <div>{item.message}</div>
                                <div className="text-sm text-gray-500">{item.date}</div>
                            </div>
                        )} />
                    </Grid>
                </div>

                <div className="col-span-3 bg-white shadow-md rounded-md p-m">
                    <h3 className="font-semibold text-lg mb-2">Изменённые файлы</h3>
                    <Grid
                        className="h-full"
                        items={selectedCommit?.files || []}
                        theme="row-stripes"
                        onActiveItemChanged={(e) => {
                            const grid = e.target as any;
                            grid.activeItem = e.detail.value;
                            setSelectedFile(e.detail.value);
                            console.log(fileVersions.original)
                            console.log(fileVersions.modified)
                        }}
                    >
                        <GridColumn header="Файл" renderer={({ item }) => <div>{item}</div>} />
                    </Grid>
                </div>

                <div className="col-span-6 bg-white shadow-md rounded-md p-m flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-xl font-semibold">
                            {selectedFile ? `Файл: ${selectedFile}` : "Файл не выбран"}
                        </div>
                        {selectedCommit?.commitHash === "unstaged" && (
                            <div className="flex gap-m">
                                <Button theme="large primary" onClick={openCommitDialog}>Создать коммит</Button>
                                <Button theme="large error" onClick={openRollbackDialog}>Откатить файлы</Button>
                            </div>
                        )}
                    </div>
                    <DiffEditor
                        original={fileVersions.original}
                        modified={fileVersions.modified}
                        language="plaintext"
                        options={{
                            renderSideBySide: false,
                            wordWrap: "on",
                            minimap: { enabled: false },
                            fontSize: 16,
                            lineHeight: 18,
                        }}
                        height="100%"
                        width="100%"
                    />
                </div>
            </div>

            <Dialog opened={isCommitDialogOpen} onOpenedChanged={(e) => setIsCommitDialogOpen(e.detail.value)}>
                <CheckboxGroup theme="vertical" label="Выберите файлы для коммита" value={selectedFilesForCommit} onValueChanged={(e) => setSelectedFilesForCommit(e.detail.value)}>
                    {unstagedFiles.map(file => <Checkbox key={file} value={file} label={file} />)}
                </CheckboxGroup>
                <Button onClick={handleCommit}>Закоммитить</Button>
            </Dialog>

            <Dialog opened={isRollbackDialogOpen} onOpenedChanged={(e) => setIsRollbackDialogOpen(e.detail.value)}>
                <CheckboxGroup  theme="vertical" label="Выберите файлы для отката" value={selectedFilesForRollback} onValueChanged={(e) => setSelectedFilesForRollback(e.detail.value)}>
                    {unstagedFiles.map(file => <Checkbox key={file} value={file} label={file} />)}
                </CheckboxGroup>
                <Button onClick={handleRollback}>Откатить</Button>
            </Dialog>
        </div>
    );

    const mobileLayout = (
        <AnimatePresence>
            {mobileStep === 'commits' && (
                <motion.div
                    key="commits"
                    initial={{opacity: 0, x: 50}}
                    animate={{opacity: 1, x: 0}}
                    exit={{opacity: 0, x: -50}}
                    className="h-full w-full"
                >
                    <header className="w-full">
                        <HorizontalLayout theme="spacing" className="w-full items-center justify-between p-m">
                            <span className="text-l font-semibold">Коммиты</span>
                        </HorizontalLayout>
                    </header>
                    <VerticalLayout theme="spacing padding" className="w-full h-full">
                        <Grid
                            className="h-full"
                            items={commits}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                grid.activeItem = e.detail.value;
                                setSelectedCommit(e.detail.value);
                                setSelectedFile(null);
                                setFileVersions({ original: "", modified: "" });
                                setMobileStep("files")
                                console.log(selectedCommit)

                            }}
                        >
                            <GridColumn header="История" renderer={({ item }) => (
                                <div>
                                    <div>{item.message}</div>
                                    <div className="text-sm text-gray-500">{item.date}</div>
                                </div>
                            )} />
                        </Grid>
                    </VerticalLayout>
                </motion.div>
            )}

            {mobileStep === 'files' && (
                <motion.div
                    key="files"
                    initial={{opacity: 0, x: 50}}
                    animate={{opacity: 1, x: 0}}
                    exit={{opacity: 0, x: -50}}
                    className="h-full w-full"
                >
                    <header className="w-full">
                        <HorizontalLayout theme="spacing" className="w-full h-full items-center justify-between p-m">
                            <Button onClick={() => setMobileStep('commits')}>Назад</Button>
                            <span className="text-l font-semibold">Изменённые файлы</span>
                        </HorizontalLayout>
                    </header>
                    <VerticalLayout theme="spacing padding" className="w-full h-full">
                        <Grid
                            className="h-full"
                            items={selectedCommit?.files || []}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                grid.activeItem = e.detail.value;
                                setSelectedFile(e.detail.value);
                                setMobileStep("editor")
                                console.log(fileVersions.original)
                                console.log(fileVersions.modified)
                            }}
                        >
                            <GridColumn header="Файл" renderer={({ item }) => <div>{item}</div>} />
                        </Grid>
                    </VerticalLayout>
                </motion.div>
            )}

            {mobileStep === 'editor' && (
                <motion.div
                    key="editor"
                    initial={{opacity: 0, x: 50}}
                    animate={{opacity: 1, x: 0}}
                    exit={{opacity: 0, x: -50}}
                    className="h-full w-full"
                >
                    <header className="w-full">
                        <HorizontalLayout theme="spacing" className="w-full items-center justify-between p-m">
                            <Button onClick={() => setMobileStep('files')}>Назад</Button>
                            <span className="text-l font-semibold">Редактор</span>
                        </HorizontalLayout>
                    </header>
                    <VerticalLayout theme="spacing padding">
                        <div style={{fontSize: '1.575rem'}} className="flex-wrap">
                            {selectedFile ? `Файл: ${selectedFile}` : 'Файл не выбран'}
                        </div>
                        <DiffEditor
                            original={fileVersions.original}
                            modified={fileVersions.modified}
                            language={selectedFile ? getLanguageFromFileName(selectedFile) : 'plaintext'}
                            options={{
                                renderSideBySide: false,
                                wordWrap: 'on',
                                minimap: {enabled: false},
                                fontSize: 16,
                                lineHeight: 18,
                            }}
                            height="75vh"
                            width="100vw"
                        />
                    </VerticalLayout>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            {isMobile ? mobileLayout : desktopLayout}
        </>
    );
}
