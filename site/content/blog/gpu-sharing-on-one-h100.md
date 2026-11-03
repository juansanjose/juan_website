+++
title = "Model inferencing on a shared GPU"
date = 2026-10-26
description = "Time-slicing, MPS and MIG on one rented H100, deployed with Kubernetes DRA."
+++

<div class="gpu-article">
<p>GPUs tend to be underutilized, so there are these techniques that let you share a GPU between clients.</p><p>This post was inspired by this NVIDIA blog, where they fit various small models and tested the performance: <a href="https://developer.nvidia.com/blog/maximize-ai-infrastructure-throughput-by-consolidating-underutilized-gpu-workloads/">a post about consolidating underutilized GPU workloads</a>.</p><p>In this blog, I used Nemotron 32B and tested its inference on an H100.</p>

<div class="reading-progress" aria-hidden="true"><span class="reading-progress-bar"></span></div>
<nav class="toc" aria-label="Contents"><p><strong>Contents</strong></p><ol><li><a href="#timeslicing">Time-slicing</a></li><li><a href="#mps">MPS</a></li><li><a href="#mig">MIG</a></li><li><a href="#dra">Deploying the lab in k8s with DRA</a><ol><li><a href="#dra-timeslicing">Time-slicing</a></li><li><a href="#dra-mps">MPS</a></li><li><a href="#dra-mig">MIG</a></li></ol></li><li><a href="#original">Inference performance</a></li><li><a href="#security">Security considerations</a></li><li><a href="#conclusions">Conclusions</a></li><li><a href="#sources">Sources</a></li></ol></nav>
<style>
.gpu-article .reading-progress{position:fixed;top:0;left:0;right:0;height:3px;background:transparent;z-index:40;pointer-events:none}
.gpu-article .reading-progress-bar{display:block;height:100%;width:0;background:var(--accent)}
</style>

<section id="timeslicing"><h2>Time-slicing</h2>
<figure class="explainer workshop" aria-labelledby="turn-label">
<div class="workshop-media">
<svg class="ts-diagram" viewBox="0 0 1000 360" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-labelledby="ts-t ts-d"><title id="ts-t">Time-slicing: A and B take turns on shared compute</title><desc id="ts-d">Alternating A/B time slices on one GPU; both models stay resident in shared memory while compute switches between them.</desc><text x="40" y="52" font-size="16" fill="#263442">Compute</text><rect x="170" y="34" width="31" height="44" fill="#f5d4de"/><text x="185.5" y="60" font-size="16" text-anchor="middle" fill="#263442">A</text><rect x="201" y="34" width="31" height="44" fill="#e3efc7"/><text x="216.5" y="60" font-size="16" text-anchor="middle" fill="#263442">B</text><rect x="232" y="34" width="31" height="44" fill="#f5d4de"/><text x="247.5" y="60" font-size="16" text-anchor="middle" fill="#263442">A</text><rect x="263" y="34" width="31" height="44" fill="#e3efc7"/><text x="278.5" y="60" font-size="16" text-anchor="middle" fill="#263442">B</text><rect x="294" y="34" width="31" height="44" fill="#f5d4de"/><text x="309.5" y="60" font-size="16" text-anchor="middle" fill="#263442">A</text><rect x="325" y="34" width="31" height="44" fill="#e3efc7"/><text x="340.5" y="60" font-size="16" text-anchor="middle" fill="#263442">B</text><rect x="356" y="34" width="31" height="44" fill="#f5d4de"/><text x="371.5" y="60" font-size="16" text-anchor="middle" fill="#263442">A</text><rect x="387" y="34" width="31" height="44" fill="#e3efc7"/><text x="402.5" y="60" font-size="16" text-anchor="middle" fill="#263442">B</text><rect x="418" y="34" width="31" height="44" fill="#f5d4de"/><text x="433.5" y="60" font-size="16" text-anchor="middle" fill="#263442">A</text><rect x="449" y="34" width="31" height="44" fill="#e3efc7"/><text x="464.5" y="60" font-size="16" text-anchor="middle" fill="#263442">B</text><line x1="150" y1="84" x2="490" y2="84" stroke="#263442" stroke-width="2"/><polyline points="490,84 482,80 482,88" fill="#263442"/><text x="320" y="102" font-size="12" text-anchor="middle" fill="#263442">time slice</text><text x="60" y="221" font-size="16" text-anchor="middle" fill="#263442">H100</text><text x="60" y="243" font-size="16" text-anchor="middle" fill="#263442">memory</text><rect x="120" y="150" width="370" height="165" fill="none" stroke="#263442"/><text x="305" y="173" font-size="18" text-anchor="middle" fill="#263442">Shared compute</text><rect x="120" y="200" width="370" height="57" fill="#f5d4de"/><text x="305" y="228.5" font-size="15" text-anchor="middle" fill="#263442">A · resident model + working memory</text><rect x="120" y="257" width="370" height="58" fill="#e3efc7"/><text x="305" y="286" font-size="15" text-anchor="middle" fill="#263442">B · resident model + working memory</text><text x="760" y="30" font-size="17" text-anchor="middle" fill="#263442">Two model servers</text><rect class="ts-box" x="600" y="165" width="320" height="125" fill="#f5d4de" stroke="#b6c4cd"/><g class="ts-robot ts-robot-a"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#f46b68" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="40" font-size="16" text-anchor="middle" fill="#263442">A</text></g><g class="ts-robot ts-robot-b"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#a8d66c" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="40" font-size="16" text-anchor="middle" fill="#263442">B</text></g><text x="760" y="315" font-size="13" text-anchor="middle" fill="#263442">Compute · context switches fully</text></svg>
</div>
<div class="workshop-copy" id="timeslicing-story"><p>A uses shared compute while B waits, then they swap.</p></div>
</figure>
<p>This is the simplest of the methods: processes take turns on the GPU. Their memory stays loaded, but the SM cores keep switching context between the clients, so there is a big inefficiency from the context switching.<a href="#source-6">[6]</a></p>
<style>.ts-cmd{margin:16px 0}
.ts-cmd pre{margin:0;background:#263442;color:#fff;border-radius:8px;padding:14px 16px;overflow:auto;font-size:13.5px;line-height:1.5}
.ts-cmd pre code{background:none;color:inherit;padding:0;white-space:pre}
.ts-cmd .note{display:block;margin-top:7px;color:var(--muted);font-size:13.5px;font-variant-numeric:tabular-nums}</style>
<p>You can change the turn length. The interval is <code>Default</code>, <code>Short</code>, <code>Medium</code> or <code>Long</code><a href="#source-6">[6]</a>, the same switch as this one on the host:</p>
<div class="ts-cmd"><pre><code>nvidia-smi compute-policy --set-timeslice 3</code></pre><span class="note">0 = DEFAULT · 1 = SHORT · 2 = MEDIUM · 3 = LONG</span></div>
<p>Short is about 1 ms, Default about 3 ms and Long about 1 second.</p><p>The problem is that if a process decides to be a greedy goblin, it can allocate all the memory for itself, and there is no preemption mechanism to reclaim that memory.</p>
</section>
<section id="mps"><h2>MPS</h2>
<figure class="explainer workshop" aria-labelledby="concurrent-label">
<div class="workshop-media">
<svg viewBox="490 0 500 360" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-labelledby="mps-t mps-d"><title id="mps-t">MPS: A and B kernels interleave on shared SMs</title><desc id="mps-d">Two clients A and B route work through an MPS server onto shared SMs and a common memory pool.</desc><text x="740" y="20" font-size="19" text-anchor="middle" font-weight="700" fill="#263442">MPS · SHARED</text><g transform="translate(620,78)"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#f46b68" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="40" font-size="16" text-anchor="middle" fill="#263442">A</text></g><g transform="translate(860,78)"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#a8d66c" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="40" font-size="16" text-anchor="middle" fill="#263442">B</text></g><line x1="620" y1="96" x2="730" y2="132" stroke="#263442" stroke-width="2"/><line x1="860" y1="96" x2="750" y2="132" stroke="#263442" stroke-width="2"/><rect x="684" y="129" width="112" height="34" rx="10" fill="#263442"/><text x="740" y="151" font-size="14" text-anchor="middle" class="on-dark">MPS server</text><rect x="500" y="178" width="480" height="62" fill="#f6f8fa" stroke="#b6c4cd"/><text x="740" y="190" font-size="15" text-anchor="middle" fill="#263442">Thread blocks on shared SMs</text><rect x="512" y="202" width="108" height="30" fill="white" stroke="#b6c4cd"/><text x="566" y="211" font-size="11" text-anchor="middle" fill="#263442">SM</text><rect x="518" y="217" width="46" height="10" fill="#f46b68"/><rect x="568" y="217" width="46" height="10" fill="#a8d66c"/><rect x="628" y="202" width="108" height="30" fill="white" stroke="#b6c4cd"/><text x="682" y="211" font-size="11" text-anchor="middle" fill="#263442">SM</text><rect x="634" y="217" width="46" height="10" fill="#f46b68"/><rect x="684" y="217" width="46" height="10" fill="#a8d66c"/><rect x="744" y="202" width="108" height="30" fill="white" stroke="#b6c4cd"/><text x="798" y="211" font-size="11" text-anchor="middle" fill="#263442">SM</text><rect x="750" y="217" width="46" height="10" fill="#f46b68"/><rect x="800" y="217" width="46" height="10" fill="#a8d66c"/><rect x="860" y="202" width="108" height="30" fill="white" stroke="#b6c4cd"/><text x="914" y="211" font-size="11" text-anchor="middle" fill="#263442">SM</text><rect x="866" y="217" width="46" height="10" fill="#f46b68"/><rect x="916" y="217" width="46" height="10" fill="#a8d66c"/><rect x="500" y="248" width="480" height="67" fill="#f6f8fa" stroke="#b6c4cd"/><text x="740" y="260" font-size="14" text-anchor="middle" fill="#263442">Common memory pool · resident model + context</text><rect x="512" y="278" width="100" height="24" fill="#f5d4de" stroke="#f46b68" stroke-width="2"/><text x="562.0" y="290" font-size="13" text-anchor="middle" fill="#263442">A</text><rect x="618" y="278" width="74" height="24" fill="#e3efc7" stroke="#a8d66c" stroke-width="2"/><text x="655.0" y="290" font-size="13" text-anchor="middle" fill="#263442">B</text><rect x="698" y="278" width="52" height="24" fill="#f5d4de" stroke="#f46b68" stroke-width="2"/><text x="724.0" y="290" font-size="13" text-anchor="middle" fill="#263442">A</text><rect x="756" y="278" width="110" height="24" fill="#e3efc7" stroke="#a8d66c" stroke-width="2"/><text x="811.0" y="290" font-size="13" text-anchor="middle" fill="#263442">B</text><text x="922" y="290" font-size="12" text-anchor="middle" fill="#5b6b76">free</text><text x="740" y="334" font-size="14" text-anchor="middle" fill="#263442">SM = streaming multiprocessor</text></svg>
</div>

</figure>
<p>MPS implements a client-server architecture: there is a server that accepts client CUDA processes. The clients send their work to the server, and the server arbitrates the shared scheduling resources so they run on the GPU at the same time instead of taking turns.</p><p>The SMs and memory stay shared between the clients, and letting them work concurrently is what raises utilization when no single program fills the card alone.</p><p>The CUDA application takes control of the context and submits its work to the GPU directly.<a href="#source-1">[1]</a> You can also partition the SMs between clients with an active-thread limit, which caps how much a client can use.<a href="#source-1">[1]</a></p>
</section>
<section id="mig"><h2>MIG</h2>
<figure class="explainer workshop" aria-labelledby="partition-label">
<div class="workshop-media">
<svg viewBox="490 0 500 360" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-labelledby="mig-t mig-d"><title id="mig-t">MIG: two fixed slices behind a hard boundary</title><desc id="mig-d">A and B each own a 3g.40gb slice with its own SMs and resident memory, separated by a hard boundary.</desc><text x="740" y="20" font-size="19" text-anchor="middle" font-weight="700" fill="#263442">MIG</text><g transform="translate(620,80)"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#f46b68" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="-34" font-size="16" text-anchor="middle" fill="#263442">A</text></g><g transform="translate(860,80)"><rect x="-23" y="-20" width="46" height="36" rx="8" fill="#a8d66c" stroke="#263442" stroke-width="2"/><line x1="0" y1="-20" x2="0" y2="-28" stroke="#263442" stroke-width="2"/><circle cx="0" cy="-29" r="3" fill="#263442"/><circle cx="-9" cy="-5" r="3" fill="#263442"/><circle cx="9" cy="-5" r="3" fill="#263442"/><text x="0" y="-34" font-size="16" text-anchor="middle" fill="#263442">B</text></g><line x1="620" y1="98" x2="620" y2="131" stroke="#263442" stroke-width="2"/><polyline points="615,126 620,133 625,126" fill="none" stroke="#263442" stroke-width="2"/><line x1="860" y1="98" x2="860" y2="131" stroke="#263442" stroke-width="2"/><polyline points="855,126 860,133 865,126" fill="none" stroke="#263442" stroke-width="2"/><line x1="740" y1="135" x2="740" y2="300" stroke="#263442" stroke-width="5"/><rect x="515" y="135" width="210" height="165" fill="#fafbfc" stroke="#d4dee4"/><text x="620" y="148" font-size="15" text-anchor="middle" fill="#263442">3g.40gb · 46 SMs</text><line x1="620" y1="160" x2="620" y2="176" stroke="#263442" stroke-width="2"/><polyline points="620,176 616,168 624,168" fill="#263442"/><rect x="525" y="178" width="190" height="72" fill="white" stroke="#f46b68" stroke-width="2"/><text x="533" y="188" font-size="11" fill="#263442">SM · compute</text><rect x="532.0" y="196.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="534.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="548.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="534.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="548.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="568.0" y="196.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="570.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="584.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="570.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="584.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="604.0" y="196.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="606.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="620.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="606.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="620.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="640.0" y="196.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="642.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="656.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="642.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="656.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="676.0" y="196.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="678.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="692.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="678.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="692.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="532.0" y="220.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="534.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="548.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="534.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="548.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="568.0" y="220.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="570.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="584.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="570.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="584.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="604.0" y="220.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="606.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="620.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="606.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="620.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="640.0" y="220.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="642.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="656.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="642.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="656.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="676.0" y="220.0" width="32.0" height="20.0" fill="#f5d4de" stroke="#f46b68" stroke-width="1"/><rect x="678.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="692.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="678.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="692.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#f46b68" stroke-width="1"/><rect x="525" y="258" width="190" height="37" fill="#f5d4de" stroke="#f46b68" stroke-width="2"/><text x="620" y="276.5" font-size="12" text-anchor="middle" fill="#263442">Resident model + context</text><rect x="755" y="135" width="210" height="165" fill="#fafbfc" stroke="#d4dee4"/><text x="860" y="148" font-size="15" text-anchor="middle" fill="#263442">3g.40gb · 46 SMs</text><line x1="860" y1="160" x2="860" y2="176" stroke="#263442" stroke-width="2"/><polyline points="860,176 856,168 864,168" fill="#263442"/><rect x="765" y="178" width="190" height="72" fill="white" stroke="#a8d66c" stroke-width="2"/><text x="773" y="188" font-size="11" fill="#263442">SM · compute</text><rect x="772.0" y="196.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="774.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="788.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="774.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="788.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="808.0" y="196.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="810.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="824.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="810.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="824.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="844.0" y="196.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="846.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="860.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="846.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="860.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="880.0" y="196.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="882.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="896.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="882.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="896.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="916.0" y="196.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="918.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="932.0" y="198.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="918.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="932.0" y="206.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="772.0" y="220.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="774.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="788.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="774.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="788.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="808.0" y="220.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="810.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="824.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="810.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="824.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="844.0" y="220.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="846.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="860.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="846.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="860.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="880.0" y="220.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="882.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="896.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="882.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="896.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="916.0" y="220.0" width="32.0" height="20.0" fill="#e3efc7" stroke="#a8d66c" stroke-width="1"/><rect x="918.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="932.0" y="222.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="918.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="932.0" y="230.0" width="14.0" height="8.0" fill="none" stroke="#a8d66c" stroke-width="1"/><rect x="765" y="258" width="190" height="37" fill="#e3efc7" stroke="#a8d66c" stroke-width="2"/><text x="860" y="276.5" font-size="12" text-anchor="middle" fill="#263442">Resident model + context</text><text x="740" y="322" font-size="12" text-anchor="middle" fill="#263442">Hard boundary · compute and memory stay in each slice</text></svg>
</div>


</figure>
<p>MIG essentially divides the GPU into smaller pieces. Each GPU has its own set of profiles and can be divided differently, and not all GPUs support MIG. In my case I divided my H100 into two, one slice for each client. This way, the process inside a slice can't access the SMs and memory of the other slice.</p><p>This is the main difference from the other methods: this is the only one that actually offers the client a way to make sure the resources are not shared inside the GPU.<a href="#source-8">[8]</a></p><p>I found this table to explain the different features offered in each mode.</p><table><caption>Table 3: CUDA Concurrency Mechanisms<a href="#source-8">[8]</a></caption><thead><tr><th></th><th>Streams</th><th>MPS</th><th>MIG</th></tr></thead><tbody><tr><th>Partition Type</th><td>Single Process</td><td>Logical</td><td>Physical</td></tr><tr><th>Max Partitions</th><td>Unlimited</td><td>48</td><td>7</td></tr><tr><th>SM Performance Isolation</th><td>No</td><td>Yes (by percentage, not partitioning)</td><td>Yes</td></tr><tr><th>Memory Protection</th><td>No</td><td>Yes</td><td>Yes</td></tr><tr><th>Memory Bandwidth QoS</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th>Error Isolation</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th>Cross-Partition Interop</th><td>Always</td><td>IPC</td><td>Limited IPC</td></tr><tr><th>Reconfigure</th><td>Dynamic</td><td>Process Launch</td><td>When Idle</td></tr></tbody></table>
</section>
<section id="dra"><h2>Deploying the lab in k8s with DRA</h2><p>DRA, dynamic resource allocation, made deploying this lab pretty easy.<a href="#source-3">[3]</a> The old way with the device plugin was not that good: you could only set a GPU resource inside the pod, whereas with DRA, like with PVCs, you just ask for what you want, and DRA takes care of setting everything up, finding and giving you the resources.<a href="#source-7">[7]</a></p>
<h3 id="dra-timeslicing">Time-slicing</h3><p>You just specify the resource claim for a GPU shared through time-slicing, and you can set the interval in it.<a href="#source-6">[6]</a></p>
<pre class="claim"><code>apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: shared-gpu
  namespace: dra-lab
spec:
  devices:
    requests:
    - name: gpu
      exactly:
        deviceClassName: gpu.nvidia.com
    config:
    - requests: ["gpu"]
      opaque:
        driver: gpu.nvidia.com
        parameters:
          apiVersion: resource.nvidia.com/v1beta1
          kind: GpuConfig
          sharing:
            strategy: TimeSlicing
            timeSlicingConfig:
              interval: Default</code></pre>
<pre class="claim"><code>apiVersion: v1
kind: Pod
metadata:
  name: server
  namespace: dra-lab
spec:
  resourceClaims:
  - name: device
    resourceClaimName: shared-gpu
  containers:
  - name: server
    image: &lt;your-image&gt;
    resources:
      claims:
      - name: device</code></pre>
<h3 id="dra-mps">MPS</h3>
<p>The MPS configuration is the same block with a different strategy and per-client limits:</p>
<pre class="claim"><code>apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: shared-gpu
  namespace: dra-lab
spec:
  devices:
    requests:
    - name: gpu
      exactly:
        deviceClassName: gpu.nvidia.com
    config:
    - requests: ["gpu"]
      opaque:
        driver: gpu.nvidia.com
        parameters:
          apiVersion: resource.nvidia.com/v1beta1
          kind: GpuConfig
          sharing:
            strategy: MPS
            mpsConfig:
              defaultActiveThreadPercentage: 50
              defaultPinnedDeviceMemoryLimit: 10Gi</code></pre><p>The pinned-memory limit in <code>mpsConfig</code> is only a number you give the MPS server: it says how much memory a client may use, not how much it gets to itself. There are no hard throughput guarantees.<a href="#source-2">[2]</a></p>
<p>Also important: you want the pods to reference the same MPS server, not create multiple MPS servers. You need to use a ResourceClaim, not a ResourceClaimTemplate, since that creates a different ResourceClaim for each pod.</p>
<pre class="claim"><code>apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: shared-gpu
  namespace: dra-lab
spec:
  devices:
    requests:
    - name: gpu
      exactly:
        deviceClassName: gpu.nvidia.com
    config:
    - requests: ["gpu"]
      opaque:
        driver: gpu.nvidia.com
        parameters:
          apiVersion: resource.nvidia.com/v1beta1
          kind: GpuConfig
          sharing:
            strategy: MPS
            mpsConfig:
              defaultActiveThreadPercentage: 50
              defaultPinnedDeviceMemoryLimit: 10Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: server-a
  namespace: dra-lab
spec:
  resourceClaims:
  - name: device
    resourceClaimName: shared-gpu   # name the claim, do not use a template
  containers:
  - name: server-a
    image: &lt;your-image&gt;
    resources:
      claims:
      - name: device
# Both pods name the same claim, so they get the same GPU and the same MPS daemon.</code></pre>

<h3 id="dra-mig">MIG</h3>
<p>The MIG configuration names the MIG device class and picks the profile with a CEL selector:<a href="#source-9">[9]</a></p>
<pre class="claim"><code># Dynamic MIG: the driver creates a matching partition when the pod is prepared
apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: mig-partition
  namespace: dra-lab
spec:
  devices:
    requests:
    - name: mig
      exactly:
        deviceClassName: mig.nvidia.com
        selectors:
        - cel:
            expression: "device.attributes['gpu.nvidia.com'].profile == '3g.40gb'"</code></pre>
<p>For several pods, the template form gives each pod its own claim:</p>
<pre class="claim"><code># Template form: Kubernetes creates one ResourceClaim per pod from it.
# The same manifest works in static and dynamic MIG mode; the difference is
# only who created the partition (an administrator, or the driver on demand).
apiVersion: resource.k8s.io/v1
kind: ResourceClaimTemplate
metadata:
  name: mig-partition
  namespace: dra-lab
spec:
  spec:
    devices:
      requests:
      - name: mig
        exactly:
          deviceClassName: mig.nvidia.com
          selectors:
          - cel:
              expression: "device.attributes['gpu.nvidia.com'].profile == '3g.40gb'"
---
apiVersion: v1
kind: Pod
metadata:
  name: mig-probe
  namespace: dra-lab
spec:
  resourceClaims:
  - name: device
    resourceClaimTemplateName: mig-partition
  containers:
  - name: probe
    image: &lt;your-image&gt;
    resources:
      claims:
      - name: device</code></pre>

<p>At first I decided to create the MIG partition manually, because the DRA plugin for MPS and DynamicMIG can't work together, so I had to turn the MPS feature off to enable DynamicMIG.</p><p>I also found how it was done with the device plugin: <a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes</a></p><p>As you can see, you needed to define the MIG partitions yourself. With DRA you don't need to worry about partitions or anything else.</p>




</section>
<section id="original"><h2>Inference performance</h2>
<p>I used the InferenceX repo for this test and measured tokens/s and TTFT. I think the graph doesn't say much because everything is close together, except time-slicing Short and Long, which for some reason got much lower throughput than the other methods. The winners are MPS at 100% and 50%, just barely over MIG.</p>
<div class="table-wrap"><table><caption>1,024 input / 1,024 output tokens. Medians of three repeats at five requests per server.</caption><thead><tr><th>Sharing setting</th><th>Total output (tokens/s)</th><th>p95 first-token wait (ms)</th></tr></thead><tbody><tr><th>Time-slicing Default</th><td>498</td><td>471</td></tr><tr><th>Time-slicing Short</th><td>385</td><td>1,387</td></tr><tr><th>Time-slicing Long</th><td>413</td><td>1,400</td></tr><tr><th>MPS 25%</th><td>513</td><td>516</td></tr><tr><th>MPS 50%</th><td>611</td><td>392</td></tr><tr><th>MPS 100%</th><td>626</td><td>376</td></tr><tr><th>MIG: two 3g.40gb slices</th><td>594</td><td>394</td></tr></tbody></table></div>


<iframe class="performance-chart" title="All H100 sharing settings and model alone, with family visibility toggles" src="/gpu-sharing/combined.html" loading="lazy"></iframe></section>
<section id="interpretation"><div id="gpu-captures"><div>Here you can check the SMI output that each method gives for the GPU.</div><div class="gpu-modes" role="group" aria-label="GPU capture mode"></div><p role="status"></p><pre tabindex="0" aria-label="Recorded nvidia-smi output"><code></code></pre></div>
<style>.gpu-modes{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0 8px}.gpu-modes button{font:inherit;font-size:14px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:9px 16px;cursor:pointer;box-shadow:2px 2px 0 var(--chrome-shadow)}.gpu-modes button:hover{border-color:var(--button-face)}.gpu-modes button[aria-pressed=true]{background:var(--button-face);color:var(--button-text)}.gpu-modes button:focus-visible{outline:3px solid #e8a317}#gpu-captures pre{height:440px;overflow:auto}#gpu-captures [role=status]:empty{display:none}</style>
<script src="/js/gpu-captures-bundled.js"></script>
<p>With MPS, the percentage configured for a client is what changes its resource usage: server A's device probes reported 28 multiprocessors at MPS 25% and 114 at MPS 100%.</p></section>



<section id="security"><h2>Security considerations</h2>
<p>I was able to find these interesting blogs about GPU partitioning. They essentially state that these modes should not be used as actual security boundaries, because there are many resources that stay shared between clients: the shared PCIe function, the DMA path, the power envelope, the firmware-defined control paths. Give them a read; it is worth it.<a href="#source-4">[4]</a> <a href="#source-5">[5]</a></p></section>
<section id="conclusions"><h2>Conclusions</h2><p>The most interesting part of this experiment for me was DRA: the ability to set these resources dynamically was pretty cool. I think the project is not quite ready yet, as many of the features are in alpha, and I even found that things like using MPS with MIG are not possible, but I think it is the right way to approach GPU handling overall.</p><p>I find it hard to justify running inference on MIG instances or MPS, as there isn't much security in these methods and the performance is pretty bad. CERN uses this for their experiment teams, who tend to underutilize the resources assigned to them on GPUs.<a href="#source-10">[10]</a> And either way, if you want maximum inference performance, you probably want bare-metal nodes.</p><p>Thank you for reading my blog. This is my first time! Hehe.</p></section>
<section id="sources"><h2>Sources</h2><ol class="small">
<li id="source-1"><a href="https://docs.nvidia.com/deploy/pdf/CUDA_Multi_Process_Service_Overview.pdf">NVIDIA Multi-Process Service guide</a> <a href="/gpu-sharing/NVIDIA-CUDA-MPS-Guide.pdf">Saved PDF</a></li>
<li id="source-2"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/mps/">DRA Driver for NVIDIA GPUs: GPU sharing with Multi-Process Service</a></li>
<li id="source-3"><a href="https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/">Kubernetes: Dynamic Resource Allocation</a></li>
<li id="source-4"><a href="https://www.linkedin.com/pulse/mig-complete-security-boundary-hardware-partitioning-shared-daula-slbac/">MIG Is Not a Complete Security Boundary</a></li>
<li id="source-5"><a href="https://www.linkedin.com/pulse/gpus-security-boundary-its-architectural-gaps-run-all-kavitha-daula-3zvoe/">GPUs Are Not a Security Boundary and Its Architectural Gaps Run All the Way Down</a></li>
<li id="source-6"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/gpu-allocation/time-slicing/">DRA Driver for NVIDIA GPUs: Time-slicing</a></li>
<li id="source-7"><a href="https://github.com/NVIDIA/k8s-device-plugin/blob/main/README.md#shared-access-to-gpus">NVIDIA device plugin for Kubernetes: Shared Access to GPUs</a></li>
<li id="source-8"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/index.html">NVIDIA Multi-Instance GPU (MIG) User Guide</a></li>
<li id="source-9"><a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">NVIDIA: Using MIG Strategies in Kubernetes</a></li>
<li id="source-10"><a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ">GPU Sharing at CERN: Cutting the Cake Without Losing a Slice!</a>, Diana Gaponcic, KubeCon EU 2025.</li>
</ol></section>
</div>

<style>
.gpu-article .toc{margin:0 0 1.6rem}.gpu-article .toc ol{margin:0;padding-left:1.6rem}.gpu-article .toc ol ol{list-style:lower-alpha}
.gpu-article{--ink:var(--fg);--muted:var(--muted);--line:var(--border);--accent:var(--link);color:var(--fg);background:transparent;font:18px/1.6 Georgia,"Times New Roman",serif}
.gpu-article h2{font-size:1.3rem;margin:0 0 1.25rem}
.gpu-article section{margin:2.5rem 0}
.gpu-article a{color:var(--accent)}
.gpu-article .small{font-size:14px;color:var(--muted)}
.gpu-article .table-wrap{overflow:auto}
.gpu-article table{border-collapse:collapse;width:100%;margin:1.25rem 0}
.gpu-article th,.gpu-article td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}
.gpu-article caption{text-align:left;font-size:15px}
.gpu-article iframe{width:100%;border:0}
.gpu-article a:focus-visible{outline:3px solid var(--accent)}
.gpu-article pre{overflow:auto;padding:16px;background:var(--bg-shade);font:13px/1.5 monospace}
.gpu-article figure{margin:1.25rem 0}
.gpu-article figcaption{font-size:14px;color:var(--muted)}
.gpu-article .mechanism{max-width:841px;margin:24px auto}
.gpu-article .mechanism img,.gpu-article .capture img{display:block;width:100%;height:auto}
.gpu-article .performance-chart{height:750px;display:block}
@media(max-width:600px){.gpu-article .performance-chart{height:800px}}
pre.claim{margin:20px 0;background:#263442;color:#fff;border-radius:6px;padding:18px 20px;overflow:auto;font-size:14px;line-height:1.55}pre.claim code{background:none;color:inherit;padding:0;white-space:pre}
pre.claim code .y-key{color:#79c0ff}pre.claim code .y-punct{color:#ff7b72}pre.claim code .y-str{color:#a5d6ff}pre.claim code .y-comment{color:#8b949e;font-style:italic}pre.claim code .y-known{color:#ffa657}pre.claim code .y-val{color:#7ee787}pre.claim code .y-num{color:#79b8ff}
/* Original, static sharing panels. Colors identify clients, not SMs. */
.explainer{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:#f7fafb;margin:24px 0;box-shadow:0 3px 0 #eaf0f2}
.panel-kicker{padding:14px 22px;border-bottom:1px solid #d5e1e5;color:#38616b;font:650 12px/1.5 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;background:#edf4f5}
.panel-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:20px;align-items:center;padding:22px 18px}
.explainer svg{width:100%;height:auto;display:block;overflow:visible;font:16px system-ui,sans-serif;color:#172b3a}
.explainer svg text{fill:#172b3a}.explainer svg text.on-dark{fill:#fff}.explainer .strong{font-weight:650}.explainer .diagram-label{font-size:17px;font-weight:650}.explainer .diagram-small{font-size:13px;fill:#536575}
.explainer .job-a{fill:#f5d4de;stroke:#f46b68;stroke-width:1.4}.explainer .job-b{fill:#e3efc7;stroke:#a8d66c;stroke-width:1.4}.explainer .device{fill:#fff;stroke:#a0b6bf;stroke-width:1.4}.explainer .unused{fill:#edf0f2;stroke:#9aaeb8;stroke-dasharray:4 3}.explainer .inner{fill:#ffffffa8;stroke:#ffffff;stroke-width:1}.explainer .wire{fill:none;stroke:#657f8d;stroke-width:1.6}.explainer .dashed{stroke-dasharray:4 4}.explainer .partition{stroke:#647e8d;stroke-width:3}
.panel-copy h3{font-size:20px;line-height:1.3;margin:0 0 10px}.panel-copy p{font-size:16px;line-height:1.55;margin:0 0 16px}.panel-copy h3:not(:first-child){margin-top:20px}.panel-rule{padding:12px 14px;border-left:3px solid #55848d;background:#eaf1f3;font-size:14px;font-weight:650;line-height:1.6}.panel-rule span{font-weight:400}
.explainer figcaption{padding:14px 22px;background:#fff;color:#536575;border-top:1px solid #d5e1e5;font-size:13px;line-height:1.55}.explainer figcaption a{margin-left:3px}
.dra-inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:22px 22px 0}.dra-object{border:1px solid #b7cbd3;border-radius:10px;background:white;padding:15px}.object-role{display:block;font-size:12px;color:#536575;margin-bottom:7px}.dra-object h3{font-size:17px;margin:0 0 6px;overflow-wrap:anywhere}.dra-object p,.claim-map p{font-size:14px;line-height:1.5;margin:0}.flow-arrow{text-align:center;font-size:24px;color:#657f8d;line-height:1.3;margin:7px 0}.dra-match{margin:0 22px;padding:13px 18px;border:1px solid #8cabb5;border-radius:10px;background:#e7f0f2;text-align:center;font-size:16px}.dra-match span{display:block;font-size:14px;margin-top:4px}.dra-outputs{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:0 22px 22px}.claim-map{text-align:center;border:1px solid #c8d8de;border-radius:10px;padding:14px;background:#fff}.claim-map .object-role{margin-bottom:12px}.pod-pair{display:flex;justify-content:space-around;gap:12px}.pod-a,.pod-b{display:inline-block;border:1px solid #f46b68;background:#f5d4de;padding:5px 20px;border-radius:6px;font-size:15px}.pod-b{border-color:#a8d66c;background:#e3efc7}.claim-arrow{display:block;line-height:1.6;color:#657f8d}.join-line{line-height:1.6;color:#657f8d}.claim-map code{font-size:14px;background:#eef3f5;padding:3px 8px;border-radius:4px}.claim-map p{margin-top:13px}
@media(max-width:650px){.panel-grid{grid-template-columns:1fr;gap:20px;padding:18px 14px}.explainer svg{max-width:430px;margin:0 auto}.panel-copy{padding:0 5px}.panel-kicker{padding:12px 18px}.explainer figcaption{padding:14px 18px}.dra-inputs{grid-template-columns:1fr;padding:18px 18px 0;gap:10px}.dra-object{padding:13px 15px}.dra-object p{margin:0}.dra-match{margin:0 18px}.dra-outputs{grid-template-columns:1fr;padding:0 18px 18px}.explainer{border-radius:12px}}
@media(max-width:420px){main{padding-left:16px;padding-right:16px}.explainer .diagram-small{font-size:14px}}
@media(max-width:600px){#review-toggle{position:static;display:block;margin:0 16px 20px auto;box-shadow:none}}
.workshop-media{background:#f7fafb;position:relative}
.workshop-media svg{display:block;width:100%;height:auto}
.workshop-copy{padding:16px 22px;background:#fff;color:#172b3a}
.workshop-copy p{font-size:16px;line-height:1.55;margin:0 0 10px}
.workshop-copy p:last-child{margin-bottom:0}
/* time-slicing animation: A active by default; JS toggles .b-active for B's turn */
.ts-box{fill:#f5d4de;transition:fill 1.2s ease}
.ts-robot-a,.ts-robot-b{transition:transform 1.2s ease}
.ts-robot-a{transform:translate(760px,227px)}
.ts-robot-b{transform:translate(880px,100px)}
.ts-diagram.b-active .ts-robot-a{transform:translate(620px,100px)}
.ts-diagram.b-active .ts-robot-b{transform:translate(760px,227px)}
.ts-diagram.b-active .ts-box{fill:#e3efc7}
.ts-reload{position:absolute;top:10px;right:12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px;cursor:pointer;color:var(--link);line-height:0}
.ts-reload:focus-visible{outline:3px solid #e8a317}
.ts-reload:disabled{opacity:.4;cursor:default}
@media(prefers-reduced-motion:reduce){.ts-box,.ts-robot-a,.ts-robot-b{transition:none}}
.yaml-dialog{color-scheme:light;background:var(--bg);color:var(--fg);width:min(860px,calc(100% - 24px));max-height:90vh;border:1px solid #b8c9d4;border-radius:12px;padding:20px;font:15px/1.5 system-ui,sans-serif;overflow:auto}.yaml-dialog::backdrop{background:#020617b8}.yaml-dialog header{display:flex;justify-content:space-between;align-items:center;gap:16px}.yaml-dialog h2{font-size:21px;margin:0}.yaml-dialog button,.yaml-dialog select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px}.yaml-dialog button{cursor:pointer}.yaml-selectors{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}.yaml-selectors label{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}.yaml-selectors select{width:100%}.yaml-dialog .yaml-origin{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.yaml-dialog pre{max-height:48vh;overflow:auto;padding:14px;background:var(--bg-shade);font:13px/1.5 monospace;text-align:left}.yaml-dialog code{color:var(--fg);font:inherit}.yaml-dialog a{color:var(--link)}.yaml-dialog .yaml-status{color:var(--muted);font-size:13px}.yaml-dialog .yaml-status:empty{display:none}.yaml-setting{font:inherit;font-weight:inherit;background:none;border:0;padding:0;color:var(--link);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:4px;cursor:pointer;text-align:left}.yaml-setting:hover{text-decoration-style:solid}.yaml-node{cursor:pointer}.yaml-node:hover rect,.yaml-node:focus rect{stroke:#fbbf24;stroke-width:3}.yaml-node:focus{outline:none}.yaml-dialog :focus-visible,.yaml-setting:focus-visible{outline:3px solid #008399;outline-offset:2px}
</style>

<script src="/js/yaml-highlight.js"></script>
<script src="/js/workshop-video.js"></script>
<script src="/js/resource-yaml.js"></script>
<script src="/js/calm-sharing.js"></script>
<script>(function(){var bar=document.querySelector(".gpu-article .reading-progress-bar");if(!bar)return;var article=document.querySelector(".gpu-article");function u(){var r=article.getBoundingClientRect();var total=r.height-window.innerHeight;var done=Math.min(Math.max(-r.top,0),Math.max(total,0));bar.style.width=(total>0?done/total*100:0)+"%";}window.addEventListener("scroll",u,{passive:true});window.addEventListener("resize",u);u();})();</script>
