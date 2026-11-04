+++
title = "Model inference on a shared GPU"
slug = "model-inferencing-on-a-shared-gpu"
date = 2026-10-26
description = "Time-slicing, MPS and MIG on one rented H100, deployed with Kubernetes DRA."
+++

<div class="gpu-article">
<p>A model doesn't always keep a GPU busy on its own. Time-slicing, MPS and MIG let multiple workloads share the same GPU, each with different tradeoffs.</p>
<p>After reading <a href="https://developer.nvidia.com/blog/maximize-ai-infrastructure-throughput-by-consolidating-underutilized-gpu-workloads/">NVIDIA's post on consolidating underutilized GPU workloads</a>, I wanted to try it myself. I ran two instances of Nemotron 32B on one H100 and compared their inference performance with each sharing method.</p>

<div class="reading-progress" aria-hidden="true"><span class="reading-progress-bar"></span></div>
<nav class="toc" aria-label="Contents"><p><strong>Contents</strong></p><ol><li><a href="#timeslicing">Time-slicing</a></li><li><a href="#mps">MPS</a></li><li><a href="#mig">MIG</a></li><li><a href="#dra">Deploying the lab in k8s with DRA</a><ol><li><a href="#dra-timeslicing">Time-slicing configuration</a></li><li><a href="#dra-mps">MPS configuration</a></li><li><a href="#dra-mig">MIG configuration</a></li></ol></li><li><a href="#original">Inference performance</a></li><li><a href="#security">Security considerations</a></li><li><a href="#conclusions">Conclusions</a></li><li><a href="#sources">Sources</a></li></ol></nav>
<style>
.gpu-article .reading-progress{position:fixed;top:0;left:0;right:0;height:3px;background:transparent;z-index:40;pointer-events:none}
.gpu-article .reading-progress-bar{display:block;height:100%;width:0;background:var(--accent)}
</style>

<section id="timeslicing"><h2>Time-slicing</h2>
<figure class="explainer mechanism" aria-labelledby="ts-t">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="Time-slicing diagram; scroll sideways on smaller screens">
<svg class="sharing-diagram ts-diagram" viewBox="0 0 1000 640" role="img" aria-labelledby="ts-t ts-d" style="font-family:Arial,Helvetica,sans-serif"><title id="ts-t">Time-slicing: A and B take turns on shared compute</title><desc id="ts-d">Two model servers have separate CUDA contexts. Their GPU compute takes turns while both resident models and their working memory remain allocated. The animation alternates the running client.</desc><defs><linearGradient id="ts-panel" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#eef5f7"/></linearGradient><marker id="ts-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#172b3a"/></marker></defs><rect width="1000" height="640" fill="#f7fafb"/><text x="260" y="40" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">Two model servers</text><rect x="50" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="155" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server A</text><rect x="72" y="120" width="166" height="62" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="155" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="155" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >A</text><rect x="280" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="385" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server B</text><rect x="302" y="120" width="166" height="62" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="385" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="385" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >B</text><rect x="40" y="230" width="450" height="380" rx="12" fill="url(#ts-panel)" stroke="#57929a" stroke-width="2" /><path d="M155 204 L220 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><path d="M385 204 L300 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="130" y="254" width="270" height="66" rx="12" fill="#eaf1f3" stroke="#57929a" stroke-width="2" /><text x="265" y="294" text-anchor="middle" font-size="23" fill="#172b3a" >Time-sliced scheduler</text><path d="M265 322 L265 348" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="70" y="358" width="390" height="84" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" class="ts-box"/><text x="265" y="388" text-anchor="middle" font-size="22" fill="#172b3a" >Shared compute</text><g class="ts-state-a"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A is running</text></g><g class="ts-state-b"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">B is running</text></g><rect x="70" y="466" width="390" height="104" rx="12" fill="#ffffff" stroke="#819eac" stroke-width="2" /><text x="265" y="493" text-anchor="middle" font-size="19" fill="#172b3a" >H100 memory · both models resident</text><rect x="82" y="505" width="172" height="52" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="168" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >A · resident model</text><text x="168" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><rect x="276" y="505" width="172" height="52" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="362" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >B · resident model</text><text x="362" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><text x="265" y="596" text-anchor="middle" font-size="21" fill="#172b3a" font-weight="700">GPU</text><text x="750" y="110" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">On GPU schedule</text><text x="600" y="150" text-anchor="middle" font-size="20" fill="#172b3a" >Time</text><path d="M650 144 L947 144" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><g class="ts-slot-a"><rect x="548" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="573.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="599" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="624.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="650" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="675.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="701" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="726.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="752" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="777.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="803" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="828.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="854" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="879.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="905" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="930.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><text x="752" y="278" text-anchor="middle" font-size="20" fill="#172b3a" >time slice</text><rect x="548" y="322" width="408" height="150" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="752" y="361" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A and B take turns</text><text x="752" y="399" text-anchor="middle" font-size="21" fill="#172b3a" >Only one client uses compute</text><text x="752" y="431" text-anchor="middle" font-size="21" fill="#172b3a" >at a time.</text><g class="ts-state-a"><text x="752" y="530" text-anchor="middle" font-size="23" fill="#172b3a" >A running · B waiting</text></g><g class="ts-state-b"><text x="752" y="530" text-anchor="middle" font-size="23" fill="#172b3a" >B running · A waiting</text></g></svg>
</div>
<figcaption id="timeslicing-story">A uses shared compute while B waits, then they swap. Both models stay resident in memory. <span class="sharing-diagram-hint">Scroll sideways for the full diagram.</span></figcaption>
</figure>
<p>This is the simplest of the methods: processes take turns on the GPU. Their memory stays loaded, but the SM cores keep switching context between the clients, which can add context-switching overhead.<a href="#source-6">[6]</a></p>
<p>You can change the turn length. The interval is <code>Default</code>, <code>Short</code>, <code>Medium</code> or <code>Long</code><a href="#source-6">[6]</a>, the same switch as this one on the host:</p>
<pre><code>nvidia-smi compute-policy --set-timeslice 3</code></pre>
<p class="small"><code>0=DEFAULT</code> · <code>1=SHORT</code> · <code>2=MEDIUM</code> · <code>3=LONG</code></p>
<p>The problem is that if a process decides to be a greedy goblin, it can allocate all the memory for itself, and there is no preemption mechanism to reclaim that memory.</p>
</section>
<section id="mps"><h2>MPS</h2>
<p>MPS introduces a client-server architecture to provide concurrency. Under MPS, clients draw from a common pool of connections mapped to GPU work queues and managed by the MPS server. The CUDA driver allocates connections to individual clients, which submit their work directly to the GPU without going through the MPS server.<a href="#source-11">[11]</a> <a href="#source-12">[12]</a></p>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MPS diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mps-volta-architecture.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mps-volta-architecture.svg" width="1000" height="740" loading="lazy" alt="MPS: separate client contexts, address spaces and connections submit work directly to the GPU; dashed paths show server coordination."></a>
</div>
<figcaption>MPS, based on NVIDIA's architecture and connection-pool documentation.<a href="#source-11">[11]</a> <a href="#source-12">[12]</a> Solid arrows show GPU work submission; dashed lines show coordination. <a href="/gpu-sharing/images/mps-volta-architecture.svg">View full-size diagram</a>. <span class="sharing-diagram-hint">Scroll sideways for the full diagram.</span></figcaption>
</figure>
<p>MPS provides different ways to restrict compute usage:</p>
<ul>
<li><strong>Active-thread percentage:</strong> Limits the number of GPU threads a client can execute concurrently, expressed as a percentage of the GPU's available execution capacity. For example, a 50% limit restricts how many threads can be active simultaneously, but it does not reserve 50% of the physical SMs or guarantee 50% of GPU performance.<a href="#source-13">[13]</a></li>
<li><strong>Static SM partitioning:</strong> On supported Ampere-and-newer GPUs, assigns specific groups of SMs to different partitions. These SMs are exclusive to their assigned partitions, providing stronger compute isolation and more predictable resource allocation.<a href="#source-13">[13]</a></li>
</ul>
<p>MPS also supports memory-allocation limits. Hard limits are enforced during allocation, preventing clients from allocating more memory than permitted.<a href="#source-13">[13]</a> With MPS v3 memory partitioning, a soft limit represents a protected allocation budget for a cgroup or container that clients can exceed when spare memory is available, up to their hard limit. This feature requires Linux with cgroup v2, CUDA 13.4 or newer, and a non-MIG device.<a href="#source-18">[18]</a></p>
<p>Under actual memory pressure, the MPS server can identify and terminate an eligible client exceeding its soft limit so another client's allocation can be retried. Crossing the soft limit alone does not trigger termination.<a href="#source-18">[18]</a></p>
<p>Neither active-thread percentages nor static SM partitioning guarantees end-to-end performance QoS. These mechanisms do not partition the GPU's memory controllers, L2 cache banks, or HBM bandwidth, meaning clients can still compete for the same memory bandwidth even when their memory allocations and compute resources are restricted.<a href="#source-19">[19]</a></p>
<p>The MPS results below compare active-thread percentages; they do not measure static SM partitioning or MPS v3 soft-limit behavior.</p>
</section>
<section id="mig"><h2>MIG</h2>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MIG diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mig-resource-paths.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mig-resource-paths.svg" width="1000" height="655" loading="lazy" alt="Two 3g.40gb GPU instances with separate paths through the system pipe, crossbar ports, 46 SMs, L2 cache, memory controllers and 40 GB HBM."></a>
</div>
<figcaption>Resource paths inside the two <code>3g.40gb</code> instances used here. Each row has dedicated SMs and isolated crossbar ports, L2 cache banks, memory controllers and HBM.<a href="#source-15">[15]</a> <a href="/gpu-sharing/images/mig-resource-paths.svg">View full-size diagram</a>. <span class="sharing-diagram-hint">Scroll sideways for the full diagram.</span></figcaption>
</figure>
<p>MIG essentially divides the GPU into smaller pieces. Each GPU has its own set of profiles and can be divided differently, and not all GPUs support MIG. In my case I divided my H100 into two, one slice for each client.</p><p>The main difference from the other methods is that MIG provides dedicated SM resources and isolated memory-system paths, including L2 cache banks, memory controllers, and DRAM buses. This provides a higher degree of isolation between CUDA processes and, as NVIDIA describes it, a defined level of Quality of Service (QoS) for compute and memory bandwidth.<a href="#source-15">[15]</a></p><p>This table I found summarizes the main differences between the sharing methods.</p><div class="table-wrap"><table class="concurrency-table"><caption>CUDA concurrency mechanisms (adapted for this configuration) <a href="#source-8">[8]</a></caption><thead><tr><th scope="col">Feature</th><th scope="col">Streams</th><th scope="col">MPS</th><th scope="col">MIG</th></tr></thead><tbody><tr><th scope="row">Partition Type</th><td>Single Process</td><td>Logical</td><td>Physical</td></tr><tr><th scope="row">Max Partitions</th><td>Unlimited</td><td>Hardware-dependent</td><td>7</td></tr><tr><th scope="row">SM Performance Isolation</th><td>No</td><td>Resource cap; no dedicated SMs</td><td>Yes</td></tr><tr><th scope="row">Memory Protection</th><td>No</td><td>Yes</td><td>Yes</td></tr><tr><th scope="row">Memory Bandwidth QoS</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Error Isolation</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Cross-Partition Interop</th><td>Always</td><td>IPC</td><td>Limited IPC</td></tr><tr><th scope="row">Reconfigure</th><td>Dynamic</td><td>Process Launch</td><td>When Idle</td></tr></tbody></table></div>
</section>
<section id="dra"><h2>Deploying the lab in k8s with DRA</h2><p>DRA (Dynamic Resource Allocation) made deploying this lab pretty easy.<a href="#source-3">[3]</a> With the traditional device plugin, you could request GPU resources in your Pod, but configurations such as time-slicing and MIG had to be managed separately. With DRA, it's more like using PVCs: you create a ResourceClaim describing the GPU and configuration you want, and Kubernetes, together with the DRA driver, takes care of finding, allocating, and preparing the resources for your Pod.<a href="#source-7">[7]</a></p>
<h3 id="dra-timeslicing">Time-slicing configuration</h3><p>You just need to create a ResourceClaim requesting a GPU shared through time-slicing, where you can also configure the time-slicing interval.<a href="#source-6">[6]</a></p>
<details class="yaml-example">
<summary>Time-slicing ResourceClaim</summary>
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
</details>
<details class="yaml-example">
<summary>Time-slicing Pod</summary>
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
</details>
<h3 id="dra-mps">MPS configuration</h3>
<p>The MPS configuration is the same block with a different strategy and per-client limits:</p>
<details class="yaml-example">
<summary>MPS ResourceClaim</summary>
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
              defaultPinnedDeviceMemoryLimit: 10Gi</code></pre>
</details><p>The pinned-memory limit in <code>mpsConfig</code> is only a number you give the MPS server: it says how much memory a client may use, not how much it gets to itself. There are no hard throughput guarantees.<a href="#source-2">[2]</a></p>
<p>It is important to note that if you want multiple pods to share the same GPU through the same MPS server, they should reference the same <code>ResourceClaim</code>. Using a <code>ResourceClaimTemplate</code> creates a separate <code>ResourceClaim</code> for each pod, which does not guarantee that they will share the same GPU or MPS daemon.<a href="#source-2">[2]</a></p>
<details class="yaml-example">
<summary>MPS shared claim and Pod</summary>
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
</details>

<h3 id="dra-mig">MIG configuration</h3>
<p>For MIG, unlike the MPS configuration, I used a <code>ResourceClaimTemplate</code> so that Kubernetes automatically creates a separate <code>ResourceClaim</code> for each Pod, giving each inference server its own MIG instance.<a href="#source-3">[3]</a></p>
<details class="yaml-example">
<summary>MIG claim template and Pod</summary>
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
</details>
<p>The equivalent standalone claim is:</p>
<details class="yaml-example">
<summary>MIG ResourceClaim</summary>
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
</details>
<p>Currently, the NVIDIA DRA driver's <code>MPSSupport</code> and <code>DynamicMIG</code> feature gates are mutually exclusive. This means you cannot use MPS to share a dynamically created MIG slice with this DRA configuration, even though NVIDIA supports running multiple MPS clients within the same MIG slice.<a href="#source-2">[2]</a> <a href="#source-14">[14]</a></p>
<p>You can also compare how MIG was configured with the traditional device plugin: <a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">MIG strategies in Kubernetes</a>.</p>
<p>As you can see, with the traditional device plugin, you generally had to define the MIG partitions yourself. With <code>DynamicMIG</code>, the DRA driver can create a partition matching the requested profile on demand.</p>
</section>
<section id="original"><h2>Inference performance</h2>
<p>I used the <a href="https://github.com/SemiAnalysisAI/InferenceX">InferenceX repo</a> and measured output tokens/s and time to first token (TTFT). At five requests per server, MPS 100% had the highest measured throughput: 626 tokens/s, about 25.7% above time-slicing Default at 498. MIG reached 594 tokens/s, about 19.3% above Default; MPS 100% was about 5.4% above MIG. MPS 50% was also close at 611 tokens/s.</p><p>Time-slicing Short and Long were slower in these runs and drew less power in the <a href="#gpu-captures">recorded nvidia-smi snapshots</a>: 182 W and 186 W, respectively, versus 338 W for Default. I haven't established why they were slower. These are comparisons for this workload and configuration. The table reports medians without variability, so I can't claim statistical significance. The chart also includes a model-alone run, but that single-server workload isn't a like-for-like dedicated-GPU baseline for these two-server totals.</p>
<div class="table-wrap"><table><caption>1,024 input / 1,024 output tokens. Medians of three repeats at five requests per server.</caption><thead><tr><th>Sharing setting</th><th>Total output (tokens/s)</th><th>p95 first-token wait (ms)</th></tr></thead><tbody><tr><th>Time-slicing Default</th><td>498</td><td>471</td></tr><tr><th>Time-slicing Short</th><td>385</td><td>1,387</td></tr><tr><th>Time-slicing Long</th><td>413</td><td>1,400</td></tr><tr><th>MPS 25%</th><td>513</td><td>516</td></tr><tr><th>MPS 50%</th><td>611</td><td>392</td></tr><tr><th>MPS 100%</th><td>626</td><td>376</td></tr><tr><th>MIG: two 3g.40gb slices</th><td>594</td><td>394</td></tr></tbody></table></div>


<iframe class="performance-chart" title="All H100 sharing settings and model alone, with family visibility toggles" src="/gpu-sharing/combined.html" loading="lazy"></iframe></section>
<section id="interpretation"><div id="gpu-captures"><div>Here you can check the SMI output that each method gives for the GPU.</div><div class="gpu-modes" role="group" aria-label="GPU capture mode"></div><p role="status"></p><pre tabindex="0" aria-label="Recorded nvidia-smi output"><code></code></pre></div>
<style>.gpu-modes{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0 8px}.gpu-modes button{font:inherit;font-size:14px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:9px 16px;cursor:pointer;box-shadow:2px 2px 0 var(--chrome-shadow)}.gpu-modes button:hover{border-color:var(--button-face)}.gpu-modes button[aria-pressed=true]{background:var(--button-face);color:var(--button-text)}.gpu-modes button:focus-visible{outline:3px solid #e8a317}#gpu-captures pre{height:auto;max-height:none;overflow:auto}#gpu-captures [role=status]:empty{display:none}</style>
<script src="/js/gpu-captures-bundled.js"></script>
<p>With MPS, the percentage configured for a client is what changes its resource usage: server A's device probes reported 28 multiprocessors at MPS 25% and 114 at MPS 100%. Those counts reflect the execution-resource limit, not ownership of that many exclusive physical SMs.<a href="#source-13">[13]</a></p></section>



<section id="security"><h2>Security considerations</h2>
<p>MIG's hardware isolation matters: separate GPU instances get dedicated SM resources and isolated memory-system paths. MPS active-thread limits don't provide those same boundaries.<a href="#source-15">[15]</a> That still leaves the security of the complete deployment: the host, driver, firmware, device access and tenant configuration all matter. Hardware resource isolation alone doesn't establish that the whole system is secure.</p><p>I found these two discussions useful for thinking about the wider deployment risks.<a href="#source-4">[4]</a> <a href="#source-5">[5]</a> I wouldn't use them to dismiss MIG's hardware isolation or treat it as equivalent to MPS.</p>
<p>Sharing the GPU is only part of the problem. Two inference servers can also compete for CPU time, host memory bandwidth, PCIe transfers and storage I/O. MIG isolates resources inside the GPU, but it doesn't give each tenant a separate host.<a href="#source-15">[15]</a> In a larger cluster, placement matters too: distributed jobs can compete for network bandwidth, so choosing where jobs run becomes part of the performance problem.<a href="#source-16">[16]</a> I haven't measured those effects here; this experiment compares two instances of Nemotron 32B on one H100.</p></section>
<section id="conclusions"><h2>Conclusions</h2>
<p>The most interesting part of this experiment for me was DRA: setting these resources dynamically was pretty cool. Some features I used are still alpha, and the mutually exclusive <code>MPSSupport</code> and <code>DynamicMIG</code> gates were a practical limitation.<a href="#source-2">[2]</a> MPS inside MIG is supported by NVIDIA; that broader capability wasn't what this DRA setup tested.<a href="#source-14">[14]</a></p>
<p>For these two instances of Nemotron 32B, MPS 100% gave the highest measured throughput at five requests per server, and MIG was relatively close: 626 versus 594 tokens/s. Both beat time-slicing Default at 498 tokens/s. That's a useful result for this workload and configuration, though it doesn't establish a general winner or how either compares with a comparable dedicated-GPU deployment.</p>
<p>The choice also depends on isolation: MIG partitions hardware resources, while the MPS active-thread settings here cap usage on shared resources. CERN's talk gives another example of sharing GPUs between experiment teams that underutilize their allocations.<a href="#source-10">[10]</a> Bare-metal deployment is a separate choice from GPU sharing: both MPS and MIG can run on bare metal.<a href="#source-1">[1]</a> <a href="#source-15">[15]</a></p>
<p>Thank you for reading my blog. This is my first time! Hehe.</p></section>
<section id="sources"><h2>Sources</h2><ol class="small">
<li id="source-1"><a href="https://docs.nvidia.com/deploy/mps/latest/index.html">NVIDIA Multi-Process Service guide</a> <a href="/gpu-sharing/NVIDIA-CUDA-MPS-Guide.pdf">Saved PDF</a></li>
<li id="source-2"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/mps/">DRA Driver for NVIDIA GPUs: GPU sharing with Multi-Process Service</a></li>
<li id="source-3"><a href="https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/">Kubernetes: Dynamic Resource Allocation</a></li>
<li id="source-4"><a href="https://www.linkedin.com/pulse/mig-complete-security-boundary-hardware-partitioning-shared-daula-slbac/">MIG Is Not a Complete Security Boundary</a></li>
<li id="source-5"><a href="https://www.linkedin.com/pulse/gpus-security-boundary-its-architectural-gaps-run-all-kavitha-daula-3zvoe/">GPUs Are Not a Security Boundary and Its Architectural Gaps Run All the Way Down</a></li>
<li id="source-6"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/gpu-allocation/time-slicing/">DRA Driver for NVIDIA GPUs: Time-slicing</a></li>
<li id="source-7"><a href="https://github.com/NVIDIA/k8s-device-plugin/blob/main/README.md#shared-access-to-gpus">NVIDIA device plugin for Kubernetes: Shared Access to GPUs</a></li>
<li id="source-8"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/index.html">NVIDIA Multi-Instance GPU (MIG) User Guide</a></li>
<li id="source-9"><a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">NVIDIA: Using MIG Strategies in Kubernetes</a></li>
<li id="source-10"><a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ">GPU Sharing at CERN: Cutting the Cake Without Losing a Slice!</a>, Diana Gaponcic, KubeCon EU 2025.</li>
<li id="source-11"><a href="https://docs.nvidia.com/deploy/mps/latest/architecture.html">NVIDIA MPS: Architecture</a></li>
<li id="source-12"><a href="https://docs.nvidia.com/deploy/mps/latest/appendix-environment-variables.html">NVIDIA MPS: Environment variables and connection pools</a></li>
<li id="source-13"><a href="https://docs.nvidia.com/deploy/mps/latest/when-to-use-mps.html">NVIDIA MPS: Execution-resource provisioning</a></li>
<li id="source-14"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/getting-started-with-mig.html#mig-with-cuda-mps">NVIDIA MIG: Running MPS inside MIG instances</a></li>
<li id="source-15"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/introduction.html">NVIDIA MIG: Hardware isolation and deployment options</a></li>
<li id="source-16"><a href="https://arxiv.org/abs/2310.20209">Network Contention-Aware Cluster Scheduling with Reinforcement Learning</a></li>
<li id="source-17"><a href="https://docs.nvidia.com/deploy/mps/latest/troubleshooting.html">NVIDIA MPS: Troubleshooting Guide</a></li>
<li id="source-18"><a href="https://docs.nvidia.com/deploy/mps/latest/mpsv3-memory-partitioning.html">NVIDIA MPS v3: Memory partitioning, hard/soft limits and pressure handling</a></li>
<li id="source-19"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/concepts.html#cuda-concurrency-mechanisms">NVIDIA: CUDA concurrency mechanisms and shared memory-system resources</a></li>
</ol></section>
</div>

<style>
.gpu-article .toc{margin:1.25rem 0}.gpu-article .toc ol{margin:0;padding-left:1.6rem}.gpu-article .toc ol ol{list-style:lower-alpha}
.gpu-article{--ink:var(--fg);--line:var(--border);--accent:var(--link);color:var(--fg);background:transparent;font:18px/1.6 Georgia,"Times New Roman",serif}
.gpu-article h2{font-size:1.3rem;margin:0 0 1.25rem}
.gpu-article section{margin:2.5rem 0}
.gpu-article a{color:var(--accent)}
.gpu-article .small{font-size:14px;color:var(--muted)}
.gpu-article .table-wrap{overflow:auto}
.gpu-article table{border-collapse:collapse;width:100%;margin:1.25rem 0}
.gpu-article th,.gpu-article td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}
.gpu-article caption{text-align:left;font-size:15px}
.gpu-article .concurrency-table{min-width:660px;font-size:16px;line-height:1.5}
.gpu-article .concurrency-table th,.gpu-article .concurrency-table td{border:1px solid var(--line);padding:12px 16px;vertical-align:top}
.gpu-article .concurrency-table thead th{background:var(--bg-shade)}
.gpu-article .concurrency-table th[scope=row]{width:29%}
.gpu-article .concurrency-table caption{caption-side:bottom;padding:12px 0 0}
.gpu-article iframe{width:100%;border:0}
.gpu-article a:focus-visible{outline:3px solid var(--accent)}
.gpu-article pre{overflow:auto;padding:16px;background:var(--bg-shade);font:13px/1.5 monospace}
.gpu-article figure{margin:1.25rem 0}
.gpu-article figcaption{font-size:14px;color:var(--muted)}
.gpu-article .mechanism{max-width:841px;margin:24px auto}
.gpu-article .mechanism img,.gpu-article .capture img{display:block;width:100%;height:auto}
.gpu-article .performance-chart{height:850px;display:block}
@media(max-width:600px){.gpu-article .performance-chart{height:900px}}
.gpu-article .yaml-example,.yaml-dialog{--yaml-surface:var(--article-bg);--yaml-code-surface:var(--bg-shade)}
html[data-palette]:not([data-palette="white"]):not([data-palette="yellow"]) .yaml-example,html[data-palette]:not([data-palette="white"]):not([data-palette="yellow"]) .yaml-dialog{--yaml-surface:color-mix(in srgb,var(--bg) 55%,#000);--yaml-code-surface:color-mix(in srgb,var(--bg-shade) 55%,#000)}
.gpu-article .yaml-example{margin:20px 0;border:1px solid var(--border);border-radius:6px;background:var(--yaml-surface);overflow:hidden}
.gpu-article .yaml-example summary{padding:12px 16px;font-size:16px;font-weight:700;cursor:pointer;color:var(--fg)}
.gpu-article .yaml-example summary::marker{color:var(--link)}
.gpu-article .yaml-example summary:focus-visible{outline:2px solid var(--link);outline-offset:-4px}
.gpu-article .yaml-example[open] summary{border-bottom:1px solid var(--border)}
.gpu-article pre.claim{margin:0;background:var(--yaml-code-surface);color:var(--fg);border-radius:0;padding:18px 20px;overflow:auto;font-size:14px;line-height:1.55}
pre.claim code{background:none;color:inherit;padding:0;white-space:pre}
pre.claim code .y-key,pre.claim code .y-known{color:var(--link);font-weight:700}
pre.claim code .y-punct,pre.claim code .y-comment{color:color-mix(in srgb,var(--muted) 75%,var(--fg))}
pre.claim code .y-comment{font-style:italic}
pre.claim code .y-str,pre.claim code .y-val,pre.claim code .y-num{color:var(--fg)}

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
.workshop-media > svg{display:block;width:100%;height:auto;max-width:520px;margin:0 auto}
.workshop-copy{padding:16px 22px;background:#fff;color:#172b3a}
.workshop-copy p{font-size:16px;line-height:1.55;margin:0 0 10px}
.workshop-copy p:last-child{margin-bottom:0}
/* Shared diagrams follow the MPS reference palette and typography. */
.sharing-diagram-scroll{overflow-x:auto;background:#f7fafb}
.sharing-diagram-hint{display:none}
@media(max-width:750px){.sharing-diagram-hint{display:block;margin-top:.5em}}
.gpu-article .sharing-diagram{width:100%;min-width:720px;max-width:none;margin:0;overflow:hidden}
.ts-box,.ts-slot-a,.ts-slot-b{transition:fill 1.2s ease,stroke 1.2s ease,opacity 1.2s ease}
.ts-state-b{display:none}
.ts-slot-b{opacity:.4}
.ts-diagram.b-active .ts-state-a{display:none}
.ts-diagram.b-active .ts-state-b{display:inline}
.ts-diagram.b-active .ts-slot-a{opacity:.4}
.ts-diagram.b-active .ts-slot-b{opacity:1}
.ts-diagram.b-active .ts-box{fill:#e3efc7;stroke:#8fbd60}
@media(prefers-reduced-motion:reduce){.ts-box,.ts-slot-a,.ts-slot-b{transition:none}}
.yaml-dialog{background:var(--yaml-surface);color:var(--fg);width:min(860px,calc(100% - 24px));max-height:90vh;border:1px solid var(--border);border-radius:6px;padding:20px;font:15px/1.5 system-ui,sans-serif;overflow:auto}.yaml-dialog::backdrop{background:#020617b8}.yaml-dialog header{display:flex;justify-content:space-between;align-items:center;gap:16px}.yaml-dialog h2{font-size:21px;margin:0}.yaml-dialog button,.yaml-dialog select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px}.yaml-dialog button{cursor:pointer}.yaml-selectors{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap}.yaml-selectors label{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}.yaml-selectors select{width:100%}.yaml-dialog .yaml-origin{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.yaml-dialog pre{max-height:48vh;overflow:auto;padding:14px;background:var(--yaml-code-surface);font:13px/1.5 monospace;text-align:left}.yaml-dialog code{color:var(--fg);font:inherit}.yaml-dialog a{color:var(--link)}.yaml-dialog .yaml-status{color:var(--muted);font-size:13px}.yaml-dialog .yaml-status:empty{display:none}.yaml-setting{font:inherit;font-weight:inherit;background:none;border:0;padding:0;color:var(--link);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:4px;cursor:pointer;text-align:left}.yaml-setting:hover{text-decoration-style:solid}.yaml-node{cursor:pointer}.yaml-node:hover rect,.yaml-node:focus rect{stroke:#fbbf24;stroke-width:3}.yaml-node:focus{outline:none}.yaml-dialog :focus-visible,.yaml-setting:focus-visible{outline:3px solid #008399;outline-offset:2px}
</style>

<script src="/js/yaml-highlight.js"></script>
<script src="/js/workshop-video.js"></script>
<script src="/js/resource-yaml.js"></script>
<script src="/js/calm-sharing.js"></script>
<script>(function(){var bar=document.querySelector(".gpu-article .reading-progress-bar");if(!bar)return;var article=document.querySelector(".gpu-article");function u(){var r=article.getBoundingClientRect();var total=r.height-window.innerHeight;var done=Math.min(Math.max(-r.top,0),Math.max(total,0));bar.style.width=(total>0?done/total*100:0)+"%";}window.addEventListener("scroll",u,{passive:true});window.addEventListener("resize",u);u();})();</script>
