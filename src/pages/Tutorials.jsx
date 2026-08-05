import React, { useEffect, useState } from 'react';
import SEO from '../components/SEO';
import { useLanguage } from '../context/LanguageContext';
import { extractYouTubeId } from '../components/HeroVideoBanner';

const Tutorials = () => {
    const { t } = useLanguage();
    const [tutorials, setTutorials] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('/api/tutorials')
            .then(res => res.json())
            .then(data => {
                setTutorials(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch tutorials:', err);
                setIsLoading(false);
            });
    }, []);

    const getThumbnailUrl = (url) => {
        const yId = extractYouTubeId(url);
        if (yId) {
            return `https://img.youtube.com/vi/${yId}/hqdefault.jpg`;
        }
        return '/assets/others.png';
    };

    return (
        <main className="tutorials-page">
            <SEO
                title="Planting & Gardening Video Tutorials - Rasobhoomi Plantation"
                description="Explore step-by-step video guides and tutorials on planting, caring for, and growing healthy saplings."
            />

            <section className="tutorials-header-section">
                <div className="tutorials-header-content">
                    <span className="tutorials-badge">🎥 Video Guides</span>
                    <h1 className="tutorials-main-title">{t('tutorials_title')}</h1>
                    <p className="tutorials-sub-title">{t('tutorials_subtitle')}</p>
                </div>
            </section>

            <section className="tutorials-content-section">
                <div className="tutorials-grid-container">
                    {isLoading ? (
                        <div className="tutorials-loading">
                            <div className="tutorials-spinner"></div>
                            <p>Loading video guides...</p>
                        </div>
                    ) : tutorials.length > 0 ? (
                        tutorials.map((tutorial, index) => (
                            <div key={tutorial.id || index} className="tutorial-chapter-card">
                                <div className="tutorial-card-media">
                                    <img
                                        src={getThumbnailUrl(tutorial.video_url)}
                                        alt={tutorial.title}
                                        className="tutorial-card-thumb"
                                        loading="lazy"
                                    />
                                    <span className="tutorial-chapter-tag">
                                        {t('chapter')} {index + 1}
                                    </span>
                                </div>

                                <div className="tutorial-card-body">
                                    <h2 className="tutorial-card-title">{tutorial.title}</h2>
                                    {tutorial.description && (
                                        <p className="tutorial-card-desc">{tutorial.description}</p>
                                    )}
                                    <a
                                        href={tutorial.video_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-watch-tutorial"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <polygon points="5,3 19,12 5,21"></polygon>
                                        </svg>
                                        <span>{t('watch_on_youtube')}</span>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="7" y1="17" x2="17" y2="7"></line>
                                            <polyline points="7 7 17 7 17 17"></polyline>
                                        </svg>
                                    </a>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="tutorials-empty-state">
                            <div className="empty-icon">🌱</div>
                            <h2>No Tutorial Chapters Available Yet</h2>
                            <p>We are preparing new video guides and planting chapters for you. Please check back soon!</p>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
};

export default Tutorials;
