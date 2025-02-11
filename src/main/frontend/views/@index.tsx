import { ViewConfig } from '@vaadin/hilla-file-router/types.js';
import { useEffect, useState } from "react";
import {
    Button,
    Grid,
    GridColumn,
    HorizontalLayout,
    SplitLayout,
    VerticalLayout
} from "@vaadin/react-components";
import { DiffEditor } from "@monaco-editor/react";
import CommitInfo from "Frontend/generated/ru/dovakun/services/GitEndpoint/CommitInfo";
import { GitEndpoint } from "Frontend/generated/endpoints";
import { useMediaQuery } from "react-responsive";
import { motion, AnimatePresence } from "framer-motion";
import RollbackDialog from "Frontend/component/RollbackDialog";

type FileVersions = {
    original: string;
    modified: string;
};

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

export const config: ViewConfig = {
    menu: {
        order: 0,
        icon: 'line-awesome/svg/file.svg'
    },
    title: 'Main',
    rolesAllowed: ['ADMIN'],
};

type MobileStep = 'commits' | 'files' | 'editor';

export default function MainView() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleRollbackCommit = () => {
        if (!selectedCommit) {
            alert("Коммит не выбран");
            return;
        }
        GitEndpoint.rollbackCommit(selectedCommit.commitHash)
            .then((message: string) => {
                alert(message);
            })
            .catch((error: any) => {
                console.error("Ошибка при откате коммита:", error);
                alert("Ошибка при откате коммита: " + error.message);
            });
    };

    const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null| undefined>(() => {
        const stored = localStorage.getItem("selectedCommit");
        return stored ? JSON.parse(stored) : null;
    });
    const [commits, setCommits] = useState<CommitInfo[]>(() => {
        const stored = localStorage.getItem("commits");
        return stored ? JSON.parse(stored) : [];
    });
    const [selectedFile, setSelectedFile] = useState<string | null>(() => {
        const stored = localStorage.getItem("selectedFile");
        return stored ? JSON.parse(stored) : null;
    });
    const [changeList, setChangeList] = useState<string[] | null>(() => {
        const stored = localStorage.getItem("changeList");
        return stored ? JSON.parse(stored) : [];
    });
    const [fileVersions, setFileVersions] = useState<FileVersions>(() => {
        const stored = localStorage.getItem("fileVersions");
        return stored ? JSON.parse(stored) : { original: "", modified: "" };
    });
    const isMobile = useMediaQuery({ query: '(max-width: 768px)' });
    const [mobileStep, setMobileStep] = useState<MobileStep>(() => {
        const storedStep = localStorage.getItem('mobileStep');
        return (storedStep as MobileStep) || 'commits';
    });

    useEffect(() => {
        localStorage.setItem("selectedCommit", JSON.stringify(selectedCommit));
    }, [selectedCommit]);

    useEffect(() => {
        localStorage.setItem("commits", JSON.stringify(commits));
    }, [commits]);

    useEffect(() => {
        localStorage.setItem("selectedFile", JSON.stringify(selectedFile));
    }, [selectedFile]);

    useEffect(() => {
        localStorage.setItem("changeList", JSON.stringify(changeList));
    }, [changeList]);

    useEffect(() => {
        localStorage.setItem("fileVersions", JSON.stringify(fileVersions));
    }, [fileVersions]);

    useEffect(() => {
        GitEndpoint.getAllCommits().then(setCommits);
    }, []);

    useEffect(() => {
        if (selectedCommit != null) {
            GitEndpoint.getChangedFiles(selectedCommit.commitHash)
                .then((data) => {
                    console.log("Полученные данные:", data);
                    setChangeList(data);
                })
                .catch(err => console.error(err));
        }
    }, [selectedCommit]);

    useEffect(() => {
        if (selectedCommit && selectedFile) {
            GitEndpoint.getFileVersions(selectedCommit.commitHash, selectedFile)
                .then(setFileVersions)
                .catch(err => console.error(err));
        }
    }, [selectedCommit, selectedFile]);

    useEffect(() => {
        localStorage.setItem('mobileStep', mobileStep);
    }, [mobileStep]);

    const desktopLayout = (
        <div className="h-full w-full">
            <header className="w-full">
                <HorizontalLayout theme="spacing" className="w-full items-center justify-between p-m">
                    <span className="text-l font-semibold">Редактор</span>
                    <Button theme="secondary">Выйти</Button>
                </HorizontalLayout>
            </header>
            <RollbackDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                commitHash={selectedCommit?.commitHash || ""}
                changeList={changeList || []}
            />
            <SplitLayout orientation="vertical">
                <div className="w-full flex-grow layout-class">
                    <VerticalLayout theme="spacing padding" className="rounded-m">
                        <Grid
                            key="commits"
                            title="Коммиты"
                            items={commits}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                grid.activeItem = e.detail.value;
                                setSelectedCommit(e.detail.value);
                                setSelectedFile(null);
                                setChangeList([]);
                                setFileVersions({ original: "", modified: "" });
                            }}
                        >
                            <GridColumn
                                path="commitId"
                                header="История"
                                renderer={({ item }) => (
                                    <div>
                                        <div>{item.commitId}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'gray' }}>{item.date}</div>
                                    </div>
                                )}
                            />
                        </Grid>
                    </VerticalLayout>

                    <VerticalLayout theme="spacing padding" className="rounded-m">
                        <Grid
                            title="Измененные файлы"
                            items={changeList}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                const filePath = e.detail.value as string | null;
                                grid.activeItem = filePath;
                                setSelectedFile(filePath);
                            }}
                        >
                            <GridColumn header="Изменённые файлы:" renderer={({ item }) => <div>{item}</div>} />
                        </Grid>
                    </VerticalLayout>
                </div>
                <VerticalLayout theme="spacing padding">
                    <HorizontalLayout className="w-full justify-between">
                        <HorizontalLayout>
                            <div style={{ fontSize: '1.575rem' }} className="flex-wrap">
                                {selectedFile ? `Файл: ${selectedFile}` : 'Файл не выбран'}
                            </div>
                        </HorizontalLayout>
                        <HorizontalLayout className="gap-m">
                            <Button>Создать коммит</Button>
                            <Button onClick={() => setIsDialogOpen(true)}>Откатить файлы</Button>

                        </HorizontalLayout>
                    </HorizontalLayout>
                    <DiffEditor
                        original={fileVersions.original}
                        modified={fileVersions.modified}
                        language={selectedFile ? getLanguageFromFileName(selectedFile) : 'plaintext'}
                        options={{
                            renderSideBySide: false,
                            wordWrap: 'on',
                            minimap: { enabled: false },
                            fontSize: 16,
                            lineHeight: 18,
                        }}
                        height="75vh"
                        width="98vw"
                    />
                </VerticalLayout>
            </SplitLayout>
        </div>
    );

    const mobileLayout = (
        <AnimatePresence>
            {mobileStep === 'commits' && (
                <motion.div
                    key="commits"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="h-full w-full"
                >
                    <header className="w-full">
                        <HorizontalLayout theme="spacing" className="w-full items-center justify-between p-m">
                            <span className="text-l font-semibold">Коммиты</span>
                        </HorizontalLayout>
                    </header>
                    <VerticalLayout theme="spacing padding" className="w-full h-full">
                        <Grid
                            key="commits"
                            title="Коммиты"
                            items={commits}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                grid.activeItem = e.detail.value;
                                setSelectedCommit(e.detail.value);
                                setMobileStep('files');
                            }}
                        >
                            <GridColumn
                                path="commitId"
                                header="История"
                                renderer={({ item }) => (
                                    <div>
                                        <div>{item.commitId}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'gray' }}>{item.date}</div>
                                    </div>
                                )}
                            />
                        </Grid>
                    </VerticalLayout>
                </motion.div>
            )}

            {mobileStep === 'files' && (
                <motion.div
                    key="files"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
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
                            key="files"
                            title="Измененные файлы"
                            items={changeList}
                            theme="row-stripes"
                            onActiveItemChanged={(e) => {
                                const grid = e.target as any;
                                const filePath = e.detail.value as string | null;
                                grid.activeItem = filePath;
                                setSelectedFile(filePath);
                                setMobileStep("editor");
                            }}
                        >
                            <GridColumn
                                header="Изменённые файлы:"
                                renderer={({ item }) => <div>{item}</div>}
                            />
                        </Grid>
                    </VerticalLayout>
                </motion.div>
            )}

            {mobileStep === 'editor' && (
                <motion.div
                    key="editor"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="h-full w-full"
                >
                    <header className="w-full">
                        <HorizontalLayout theme="spacing" className="w-full items-center justify-between p-m">
                            <Button onClick={() => setMobileStep('files')}>Назад</Button>
                            <span className="text-l font-semibold">Редактор</span>
                        </HorizontalLayout>
                    </header>
                    <VerticalLayout theme="spacing padding">
                        <div style={{ fontSize: '1.575rem' }} className="flex-wrap">
                            {selectedFile ? `Файл: ${selectedFile}` : 'Файл не выбран'}
                        </div>
                        <DiffEditor
                            original={fileVersions.original}
                            modified={fileVersions.modified}
                            language={selectedFile ? getLanguageFromFileName(selectedFile) : 'plaintext'}
                            options={{
                                renderSideBySide: false,
                                wordWrap: 'on',
                                minimap: { enabled: false },
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
