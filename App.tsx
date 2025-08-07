
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { DescriptionLength, Suggestion, GuideContent, PointOfInterest } from './types';
import { fetchNearbyPlaces, fetchDescription, fetchLocalityFromCoords, identifyPlaceFromImage } from './services/geminiService';
import { generatePdf, generateDocx } from './services/exportService';
import { AudioIcon, BookOpenIcon, CameraIcon, DownloadIcon, FileTextIcon, FileWordIcon, LocationIcon, StopCircleIcon, ShareIcon, XCircleIcon, ImageIcon } from './components/icons';

const LoadingSpinner: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
    <div className="flex justify-center items-center p-4">
        <div className={`${className} border-4 border-t-transparent border-indigo-500 rounded-full animate-spin`}></div>
    </div>
);

const Header: React.FC<{ title: string }> = ({ title }) => (
    <header className="w-full text-center p-4 sm:p-6">
        <div className="flex items-center justify-center gap-3">
            <BookOpenIcon className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-500"/>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">{title}</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mt-2">La tua guida personale, sempre con te.</p>
    </header>
);

interface ResultCardProps {
    title: string;
    content: GuideContent;
    isSpeaking: boolean;
    canShare: boolean;
    onListen: () => void;
    onStopListen: () => void;
    onDownloadPdf: () => void;
    onDownloadDocx: () => void;
    onShare: () => void;
}
const ResultCard: React.FC<ResultCardProps> = ({ title, content, isSpeaking, canShare, onListen, onStopListen, onDownloadPdf, onDownloadDocx, onShare }) => {
    const mainParagraphs = content.description.split('\n').filter(p => p.trim() !== '');
    
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4 sm:p-6 mt-6 w-full animate-fade-in">
            <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">{title}</h2>
            
            {content.imageUrl ? (
                <img src={content.imageUrl} alt={`Immagine di ${title}`} className="w-full h-auto rounded-lg mb-4 object-cover aspect-video shadow-md" />
            ) : (
                 mainParagraphs.length > 0 && <div className="w-full h-auto rounded-lg mb-4 bg-slate-100 dark:bg-slate-700 flex items-center justify-center aspect-video"><p className='text-slate-500 dark:text-slate-400'>Nessuna immagine disponibile</p></div>
            )}

            <div className="space-y-4 prose prose-slate dark:prose-invert max-w-none">
                {mainParagraphs.map((p, i) => <p key={`main-${i}`}>{p}</p>)}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-3 justify-center">
                 <button onClick={isSpeaking ? onStopListen : onListen} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white transition-colors ${isSpeaking ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-500 hover:bg-sky-600'}`}>
                    {isSpeaking ? <StopCircleIcon className="w-5 h-5"/> : <AudioIcon className="w-5 h-5"/>}
                    {isSpeaking ? 'Ferma' : 'Ascolta'}
                </button>
                <button onClick={onDownloadPdf} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors">
                    <FileTextIcon className="w-5 h-5"/>
                    <span>PDF</span>
                </button>
                <button onClick={onDownloadDocx} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors">
                    <FileWordIcon className="w-5 h-5"/>
                    <span>DOCX</span>
                </button>
                {canShare && (
                    <button onClick={onShare} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors">
                        <ShareIcon className="w-5 h-5"/>
                        <span>Condividi</span>
                    </button>
                )}
            </div>

            {content.subPoints && content.subPoints.length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-200 mb-6 text-center">Da non perdere all'interno:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {content.subPoints.map((poi, index) => (
                            <div key={index} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg overflow-hidden shadow-md flex flex-col">
                                {poi.imageUrl ? 
                                    <img src={poi.imageUrl} alt={`Immagine di ${poi.name}`} className="w-full h-48 object-cover"/> :
                                    <div className="w-full h-48 bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center"><p className='text-slate-500 dark:text-slate-400 text-sm'>Nessuna immagine</p></div>
                                }
                                <div className="p-4 flex-grow">
                                    <h4 className="font-bold text-lg text-indigo-700 dark:text-indigo-400">{poi.name}</h4>
                                    <div className="mt-2 space-y-3 prose prose-sm prose-slate dark:prose-invert max-w-none">
                                      {poi.description.split('\n').filter(p => p.trim() !== '').map((p, i) => <p key={`sub-${index}-${i}`}>{p}</p>)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


export default function App() {
    const [query, setQuery] = useState('');
    const [location, setLocation] = useState('');
    const [descriptionLength, setDescriptionLength] = useState<DescriptionLength>(DescriptionLength.Short);
    const [includeSubPoints, setIncludeSubPoints] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [generatedContent, setGeneratedContent] = useState<GuideContent | null>(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isLoadingLocality, setIsLoadingLocality] = useState(false);
    const [isLoadingDescription, setIsLoadingDescription] = useState(false);
    const [isIdentifyingImage, setIsIdentifyingImage] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [canShare, setCanShare] = useState(false);
    const [showImageSourceChoice, setShowImageSourceChoice] = useState(false);
    
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const lastGeneratedTitle = useRef<string>('');
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const clearState = (clearQueryAndImage = false) => {
        setError('');
        setGeneratedContent(null);
        if (clearQueryAndImage) {
            setSuggestions([]);
            handleClearImage();
        }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }
    
    const handleClearImage = useCallback(() => {
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(null);
        if (galleryInputRef.current) galleryInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
    }, [imagePreview]);


    const handleGetSuggestions = useCallback(() => {
        clearState(true);
        setIsLoadingSuggestions(true);
        setSuggestions([]);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const places = await fetchNearbyPlaces(latitude, longitude);
                    setSuggestions(places);
                } catch (e: any) {
                    setError(e.message || 'Errore nel recupero dei luoghi.');
                } finally {
                    setIsLoadingSuggestions(false);
                }
            },
            (err) => {
                setError(`Errore GPS: ${err.message}. Assicurati di aver concesso i permessi di localizzazione.`);
                setIsLoadingSuggestions(false);
            },
            { enableHighAccuracy: true }
        );
    }, []);

    const handleGetLocality = useCallback(() => {
        setIsLoadingLocality(true);
        setError('');
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const locality = await fetchLocalityFromCoords(latitude, longitude);
                    setLocation(locality);
                } catch (e: any) {
                    setError(e.message || 'Errore nel recupero della località.');
                } finally {
                    setIsLoadingLocality(false);
                }
            },
            (err) => {
                setError(`Errore GPS: ${err.message}. Assicurati di aver concesso i permessi di localizzazione.`);
                setIsLoadingLocality(false);
            },
            { enableHighAccuracy: true }
        );
    }, []);

    const handleImageUploadClick = () => {
        setShowImageSourceChoice(true);
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        clearState(true);
        setQuery('');
        setIsIdentifyingImage(true);
        setError('');

        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const base64Url = reader.result as string;
                const base64Data = base64Url.split(',')[1];
                const mimeType = base64Url.match(/:(.*?);/)?.[1];

                if (!base64Data || !mimeType) {
                    throw new Error("Formato file non valido.");
                }
                
                const identifiedPlace = await identifyPlaceFromImage(base64Data, mimeType);
                setQuery(identifiedPlace);
            } catch (err: any) {
                setError(err.message || "Errore durante l'analisi dell'immagine.");
                handleClearImage(); 
            } finally {
                setIsIdentifyingImage(false);
            }
        };
        reader.onerror = () => {
            setError("Impossibile leggere il file.");
            setIsIdentifyingImage(false);
            handleClearImage();
        };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) {
            setError('Inserisci o identifica un punto di interesse.');
            return;
        }
        setGeneratedContent(null);
        setError('');
        setSuggestions([]);
        setIsLoadingDescription(true);
        lastGeneratedTitle.current = query;

        try {
            const content = await fetchDescription(query, descriptionLength, includeSubPoints, location);
            setGeneratedContent(content);
        } catch (e: any) {
            setError(e.message || 'Errore nella generazione della guida.');
        } finally {
            setIsLoadingDescription(false);
        }
    };
    
    const handleListen = useCallback(() => {
        if (!generatedContent) return;
        window.speechSynthesis.cancel();

        const mainText = generatedContent.description;
        const subPointsText = generatedContent.subPoints
            .map(sp => `${sp.name}. ${sp.description}`)
            .join('\n\n');

        const fullText = [mainText, subPointsText].filter(Boolean).join('\n\n');
        
        const utterance = new SpeechSynthesisUtterance(fullText);
        utterance.lang = 'it-IT';
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [generatedContent]);
    
    const handleStopListen = useCallback(() => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, []);

    const handleShare = useCallback(async () => {
        if (!generatedContent || !navigator.share) return;

        const mainText = generatedContent.description;
        const subPointsText = generatedContent.subPoints
            .map(sp => `${sp.name}\n${sp.description}`)
            .join('\n\n');
        
        const fullText = [mainText, subPointsText].filter(Boolean).join('\n\n');

        try {
            await navigator.share({
                title: lastGeneratedTitle.current,
                text: fullText,
            });
        } catch (error) {
            console.error('Error sharing:', error);
            setError("Impossibile avviare la condivisione.");
        }
    }, [generatedContent]);

    useEffect(() => {
        if (typeof navigator.share === 'function') {
            setCanShare(true);
        }
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);
    
    useEffect(() => {
        if(descriptionLength === DescriptionLength.Short) {
            setIncludeSubPoints(false);
        }
    }, [descriptionLength])

    return (
        <div className="min-h-screen flex flex-col items-center p-4">
            <main className="w-full max-w-3xl mx-auto flex flex-col items-center">
                <Header title="Guida Turistica AI" />
                
                {showImageSourceChoice && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowImageSourceChoice(false)}>
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 m-4 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 text-center">Aggiungi un'immagine</h3>
                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        setShowImageSourceChoice(false);
                                        cameraInputRef.current?.click();
                                    }}
                                    className="w-full flex items-center justify-center gap-3 p-3 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 transition-colors"
                                >
                                    <CameraIcon className="w-6 h-6" />
                                    <span>Scatta una foto</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setShowImageSourceChoice(false);
                                        galleryInputRef.current?.click();
                                    }}
                                    className="w-full flex items-center justify-center gap-3 p-3 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                >
                                    <ImageIcon className="w-6 h-6" />
                                    <span>Scegli dalla galleria</span>
                                </button>
                            </div>
                            <button
                                onClick={() => setShowImageSourceChoice(false)}
                                className="w-full mt-5 text-center text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                                Annulla
                            </button>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="w-full bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                    {imagePreview && !isIdentifyingImage && (
                        <div className="w-full p-2 mb-4 relative animate-fade-in">
                            <div className="relative">
                                <img src={imagePreview} alt="Anteprima" className="rounded-lg w-full max-h-60 object-contain bg-slate-100 dark:bg-slate-900" />
                                <button type="button" onClick={() => { clearState(true); setQuery('') }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/75 transition-colors" title="Rimuovi immagine">
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    )}
                    {isIdentifyingImage && (
                        <div className="w-full p-4 mb-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex flex-col items-center justify-center">
                            <LoadingSpinner />
                            <p className="text-slate-500 dark:text-slate-400 mt-2">Analisi dell'immagine in corso...</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="query-input" className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">Punto di interesse</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    id="query-input"
                                    type="text"
                                    value={query}
                                    readOnly={!!imagePreview}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        clearState(false);
                                    }}
                                    placeholder="Es. Colosseo o identifica da foto"
                                    className="flex-grow p-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition dark:bg-slate-700 dark:text-white read-only:bg-slate-100 dark:read-only:bg-slate-800"
                                />
                                <button type="button" onClick={handleImageUploadClick} className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-semibold transition-colors" title="Identifica da foto">
                                    <CameraIcon className="w-5 h-5 text-indigo-500" />
                                     <span className="sm:hidden">Da Foto</span>
                                </button>
                                <button type="button" onClick={handleGetSuggestions} className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-semibold transition-colors" title="Trova punti di interesse vicino a me">
                                    <LocationIcon className="w-5 h-5 text-indigo-500" />
                                    <span className="sm:hidden">Trova Vicino a Me</span>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="location-input" className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">Località (opzionale)</label>
                            <div className="flex gap-2">
                                <input
                                    id="location-input"
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Es. Roma, Italia"
                                    className="flex-grow p-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition dark:bg-slate-700 dark:text-white"
                                />
                                <button type="button" onClick={handleGetLocality} disabled={isLoadingLocality} className="flex items-center justify-center p-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait" title="Usa la mia posizione attuale">
                                    {isLoadingLocality ? <div className="w-5 h-5 border-2 border-t-transparent border-indigo-500 rounded-full animate-spin"></div> : <LocationIcon className="w-5 h-5 text-indigo-500" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="my-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Lunghezza descrizione:</span>
                        <div className="flex items-center gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="length" value={DescriptionLength.Short} checked={descriptionLength === DescriptionLength.Short} onChange={() => setDescriptionLength(DescriptionLength.Short)} className="form-radio text-indigo-600 focus:ring-indigo-500" />
                                Breve
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="length" value={DescriptionLength.Long} checked={descriptionLength === DescriptionLength.Long} onChange={() => setDescriptionLength(DescriptionLength.Long)} className="form-radio text-indigo-600 focus:ring-indigo-500" />
                                Lunga
                            </label>
                        </div>
                         {descriptionLength === DescriptionLength.Long && (
                            <div className="mt-3 pl-1 animate-fade-in">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                                    <input 
                                        type="checkbox" 
                                        checked={includeSubPoints} 
                                        onChange={(e) => setIncludeSubPoints(e.target.checked)}
                                        className="form-checkbox h-4 w-4 rounded text-indigo-600 bg-slate-100 border-slate-300 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600"
                                    />
                                    Includi dettagli su opere e luoghi interni
                                </label>
                            </div>
                        )}
                    </div>

                    <button type="submit" disabled={isLoadingDescription || isIdentifyingImage} className="w-full p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all disabled:bg-indigo-400 disabled:cursor-wait flex items-center justify-center gap-2">
                        {isLoadingDescription ? <LoadingSpinner className="w-6 h-6"/> : null}
                        {isLoadingDescription ? 'Generazione in corso...' : 'Crea Guida'}
                    </button>
                </form>

                <input
                    type="file"
                    ref={galleryInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                />
                 <input
                    type="file"
                    ref={cameraInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                />

                {error && <div className="mt-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-lg w-full">{error}</div>}

                {isLoadingSuggestions && <LoadingSpinner />}
                
                {suggestions.length > 0 && (
                    <div className="w-full mt-6 animate-fade-in">
                        <h3 className="font-semibold text-center text-slate-700 dark:text-slate-300">Suggerimenti nelle vicinanze:</h3>
                        <div className="flex flex-wrap gap-2 justify-center mt-3">
                            {suggestions.map((s) => (
                                <button
                                    key={s.name}
                                    onClick={() => {
                                        clearState(true);
                                        setQuery(s.name);
                                    }}
                                    className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors"
                                >
                                    {s.name} <span className="text-xs opacity-70">({s.category})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {isLoadingDescription && !generatedContent && <LoadingSpinner />}

                {generatedContent && (
                    <ResultCard
                        title={lastGeneratedTitle.current}
                        content={generatedContent}
                        isSpeaking={isSpeaking}
                        canShare={canShare}
                        onListen={handleListen}
                        onStopListen={handleStopListen}
                        onDownloadPdf={() => generatePdf(lastGeneratedTitle.current, generatedContent)}
                        onDownloadDocx={() => generateDocx(lastGeneratedTitle.current, generatedContent)}
                        onShare={handleShare}
                    />
                )}
            </main>
        </div>
    );
}
