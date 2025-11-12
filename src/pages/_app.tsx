import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Navbar />
      <main className="container-pro py-8 min-h-[calc(100vh-56px-56px)]">
        <Component {...pageProps} />
      </main>
      <Footer />
      <Toaster position="top-center" />
    </>
  );
}
