<script lang="ts">
	let dialog: HTMLDialogElement | undefined = $state();

	export function open() {
		dialog?.showModal();
	}
</script>

<!-- Shown in Italian first, then English. Clicking the backdrop (the dialog element itself) closes it. -->
<dialog bind:this={dialog} onclick={(e) => e.target === dialog && dialog.close()}>
	<div class="body">
		<p>made by <a href="https://giovanni.botti.cc/">lgb</a>!</p>
		<section lang="it">
			<h2>informazioni</h2>
			<p>
				un piccolo strumento per creare video tiktok con il testo delle tue canzoni, direttamente
				nel browser.

			<h3>come funziona</h3>
			<ol>
				<li>aggiungi un video di sfondo (o un'immagine), la canzone e il testo, poi
					scegli la parte della canzone che vuoi usare.
				</li>
				<li>avvia la canzone e premi spazio su ogni parola. correggi gli errori
					sulla timeline.
				</li>
				<li>scegli font, colori e come si animano le parole.</li>
				<li>esporta un video 1080×1920 pronto da caricare su tiktok.</li>
			</ol>

			<p>
				<strong>importante:</strong> questo strumento funziona in locale non carichi niente sui miei server
				<br>
				<strong>meno importante:</strong> funziona meglio con una versione recente di chrome, edge o safari,
				ma va bene anche firefox (ha meno opzioni di formato di export)
				l'esportazione avviene in tempo reale: un video di 30 secondi richiede 30 secondi di registrazione.
				tieni la scheda aperta nel frattempo.
			</p>
		</section>

		<hr />

		<section lang="en">
			<h2>info</h2>
			<p>
				small tool to make promotional tiktoks in your browser

			<h3>how it works</h3>
			<ol>
				<li>add background video or image, song, and lyrics</li>
				<li>select song section</li>
				<li>start the song and press space on every word. you can fix mistakes with the timeline</li>
				<li>choose font, color and other text related things</li>
				<li>export a 1080×1920 video ready for tiktok</li>
			</ol>

			<p>
				<strong>important:</strong> this tool works locally, you send nothing to my server
				<br>
				<strong>less important:</strong> works better in a recent version of chrome, edge or safari,
				but firefox works too (it has fewer export format options).
			</p>
		</section>

		<form method="dialog">
			<button>chiudi / close</button>
		</form>
	</div>
</dialog>

<style>
	dialog {
		max-width: 500px;
		padding: 0;
		border: 1px solid #000;
	}
	.body {
		padding: 10px 15px;
	}
</style>
