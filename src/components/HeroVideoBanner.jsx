import React, { useEffect, useRef, useState } from 'react';

export function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?\/]*).*/;
    const match = trimmed.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

export function isYouTubeShorts(url) {
    if (!url || typeof url !== 'string') return false;
    return url.toLowerCase().includes('/shorts/');
}

const HeroVideoBanner = ({ url, isShorts }) => {
    const videoId = extractYouTubeId(url);
    const isShortsVideo = isShorts ?? isYouTubeShorts(url);
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const iframeRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    useEffect(() => {
        if (!videoId) return;

        let player = null;
        let isMounted = true;

        const initPlayer = () => {
            if (!window.YT || !window.YT.Player || !containerRef.current) return;

            const playerElement = document.createElement('div');
            playerElement.id = 'yt-hero-player-' + Math.random().toString(36).substring(2, 9);
            
            // Clear prior contents in iframe container
            if (iframeRef.current) {
                iframeRef.current.innerHTML = '';
                iframeRef.current.appendChild(playerElement);
            }

            player = new window.YT.Player(playerElement.id, {
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    disablekb: 1,
                    enablejsapi: 1,
                    mute: 0,
                    loop: 1,
                    playlist: videoId,
                    iv_load_policy: 3,
                    showinfo: 0,
                    fs: 0,
                    autohide: 1
                },
                events: {
                    onReady: (event) => {
                        if (!isMounted) return;
                        playerRef.current = event.target;
                        setIsPlayerReady(true);
                        try {
                            // Enable sound
                            event.target.unMute();
                            event.target.setVolume(100);
                            event.target.playVideo();
                            setIsPlaying(true);
                            setIsMuted(false);
                        } catch (e) {
                            console.warn('Unmuted autoplay prevented by browser policy, falling back to muted autoplay:', e);
                            try {
                                event.target.mute();
                                event.target.playVideo();
                                setIsPlaying(true);
                                setIsMuted(true);
                            } catch (e2) {}
                        }
                    },
                    onStateChange: (event) => {
                        if (!isMounted) return;
                        // 1 = PLAYING, 2 = PAUSED
                        if (event.data === window.YT.PlayerState.PLAYING) {
                            setIsPlaying(true);
                        } else if (event.data === window.YT.PlayerState.PAUSED) {
                            setIsPlaying(false);
                        } else if (event.data === window.YT.PlayerState.ENDED) {
                            // Continuous loop to prevent recommendation screens
                            try {
                                event.target.playVideo();
                            } catch (e) {}
                        }
                    }
                }
            });
        };

        // Load YouTube IFrame API if not already present
        if (!window.YT) {
            const existingScript = document.getElementById('yt-iframe-api-script');
            if (!existingScript) {
                const tag = document.createElement('script');
                tag.id = 'yt-iframe-api-script';
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }

            const previousCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (previousCallback) previousCallback();
                initPlayer();
            };
        } else {
            initPlayer();
        }

        return () => {
            isMounted = false;
            if (player && typeof player.destroy === 'function') {
                try {
                    player.destroy();
                } catch (e) {}
            }
            playerRef.current = null;
        };
    }, [videoId]);

    // IntersectionObserver to pause video when user scrolls away / video disappears from viewport
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting && playerRef.current) {
                        try {
                            if (typeof playerRef.current.pauseVideo === 'function') {
                                playerRef.current.pauseVideo();
                                setIsPlaying(false);
                            }
                        } catch (e) {}
                    }
                });
            },
            { threshold: 0.15 }
        );

        observer.observe(containerRef.current);

        const handleVisibilityChange = () => {
            if (document.hidden && playerRef.current) {
                try {
                    if (typeof playerRef.current.pauseVideo === 'function') {
                        playerRef.current.pauseVideo();
                        setIsPlaying(false);
                    }
                } catch (e) {}
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            observer.disconnect();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Fullscreen change listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            const fsElement = document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement;

            setIsFullscreen(Boolean(fsElement && containerRef.current && (fsElement === containerRef.current || containerRef.current.contains(fsElement))));
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const togglePlayPause = () => {
        if (!playerRef.current) return;
        try {
            if (isPlaying) {
                playerRef.current.pauseVideo();
                setIsPlaying(false);
            } else {
                playerRef.current.playVideo();
                setIsPlaying(true);
            }
        } catch (e) {
            console.error('Play/Pause toggle failed:', e);
        }
    };

    const toggleMute = () => {
        if (!playerRef.current) return;
        try {
            if (isMuted) {
                playerRef.current.unMute();
                playerRef.current.setVolume(100);
                setIsMuted(false);
            } else {
                playerRef.current.mute();
                setIsMuted(true);
            }
        } catch (e) {
            console.error('Mute toggle failed:', e);
        }
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        const isCurrentlyFs = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        if (!isCurrentlyFs) {
            const elem = containerRef.current;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    };

    if (!videoId) return null;

    return (
        <div className={`hero-video-wrapper ${isShortsVideo ? 'is-shorts' : ''}`} ref={containerRef}>
            <div className="hero-video-aspect-box">
                <div className="hero-video-iframe-holder" ref={iframeRef}></div>
                {/* Click shield to intercept taps and prevent native YouTube center play/pause & video switch buttons */}
                <div className="hero-video-click-shield" onClick={togglePlayPause} aria-hidden="true" />
            </div>

            {/* Custom Overlay Controls - Play/Pause, Sound, and Fullscreen */}
            <div className="hero-video-custom-controls" aria-label="Video Controls">
                <button
                    type="button"
                    className="hero-video-btn"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? "Pause Video" : "Play Video"}
                    title={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? (
                        /* Pause Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"></rect>
                            <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"></rect>
                        </svg>
                    ) : (
                        /* Play Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21"></polygon>
                        </svg>
                    )}
                </button>

                <button
                    type="button"
                    className="hero-video-btn"
                    onClick={toggleMute}
                    aria-label={isMuted ? "Unmute Sound" : "Mute Sound"}
                    title={isMuted ? "Unmute Sound" : "Mute Sound"}
                >
                    {isMuted ? (
                        /* Muted Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
                            <line x1="23" y1="9" x2="17" y2="15"></line>
                            <line x1="17" y1="9" x2="23" y2="15"></line>
                        </svg>
                    ) : (
                        /* Sound On Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    )}
                </button>

                <button
                    type="button"
                    className="hero-video-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
                    title={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
                >
                    {isFullscreen ? (
                        /* Exit Fullscreen Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                        </svg>
                    ) : (
                        /* Fullscreen Icon */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default HeroVideoBanner;
