import { createContext, useContext, useState, useEffect } from "react";

interface PageTitleContextValue {
  title: string;
  setTitle: (title: string) => void;
}

const PageTitleContext = createContext<PageTitleContextValue>({
  title: "",
  setTitle: () => {},
});

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("");
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext).title;
}

export function useSetPageTitle(title: string) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle("");
  }, [title]);
}
