+++
title = "Model inference on a shared GPU"
slug = "model-inferencing-on-a-shared-gpu"
date = 2026-10-26
description = "Time-slicing, MPS and MIG on one rented H100, deployed with Kubernetes DRA."
+++

<div class="gpu-article">
<p>GPU utilization and resource management depend on the applications running on the GPU. Some applications consume all available GPU resources and scale across multiple GPUs, while others require only a fraction of the GPU's resources or do not use the GPU continuously.</p>
<p>To improve resource utilization, NVIDIA GPUs support several mechanisms that allow multiple processes to share the same GPU: time-sliced context switching, CUDA Multi-Process Service (MPS), and Multi-Instance GPU (MIG).</p>
<p>After reading <a href="https://developer.nvidia.com/blog/maximize-ai-infrastructure-throughput-by-consolidating-underutilized-gpu-workloads/">NVIDIA's post on consolidating underutilized GPU workloads</a>, I wanted to try it myself. I ran two instances of Nemotron 32B on one H100 and compared their inference performance with each sharing method.</p>

<div class="reading-progress" aria-hidden="true"><span class="reading-progress-bar"></span></div>
<nav class="toc" aria-label="Contents"><p><strong>Contents</strong></p><ol><li><a href="#timeslicing">Time-slicing</a></li><li><a href="#mps">MPS</a></li><li><a href="#mig">MIG</a></li><li><a href="#dra">Deploying the lab in Kubernetes with DRA</a><ol><li><a href="#dra-timeslicing">Time-slicing configuration</a></li><li><a href="#dra-mps">MPS configuration</a></li><li><a href="#dra-mig">MIG configuration</a></li></ol></li><li><a href="#original">Inference performance</a></li><li><a href="#security">Security considerations</a></li><li><a href="#conclusions">Conclusions</a></li><li><a href="#sources">Sources</a></li></ol></nav>

<section id="timeslicing"><h2>Time-slicing</h2>

<p>This is the simplest of the methods: processes take turns on the GPU. Their memory allocations stay resident while the GPU switches between CUDA contexts, which can add overhead.<a href="#source-6">[6]</a></p>
<p>You can change the turn length. The presets are <code>Default</code>, <code>Short</code>, <code>Medium</code> or <code>Long</code><a href="#source-6">[6]</a>, which correspond to this setting on the host:</p>
<pre><code>nvidia-smi compute-policy --set-timeslice 3</code></pre>
<p class="small"><code>0=DEFAULT</code> · <code>1=SHORT</code> · <code>2=MEDIUM</code> · <code>3=LONG</code></p>
<p>The problem is that if a process decides to be a greedy goblin, it can allocate all the memory for itself, and there is no preemption mechanism to reclaim that memory.</p>
<figure class="explainer mechanism" aria-labelledby="ts-t">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="Time-slicing diagram; scroll sideways on smaller screens">
<svg class="sharing-diagram ts-diagram" viewBox="0 0 1000 640" role="img" aria-labelledby="ts-t ts-d" style="font-family:Arial,Helvetica,sans-serif"><title id="ts-t">Time-slicing: A and B take turns on shared compute</title><desc id="ts-d">Two model servers have separate CUDA contexts. Their GPU compute takes turns while both resident models and their working memory remain allocated. The animation alternates the running client.</desc><defs><linearGradient id="ts-panel" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#eef5f7"/></linearGradient><marker id="ts-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#172b3a"/></marker></defs><rect width="1000" height="640" fill="#f7fafb"/><text x="260" y="40" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">Two model servers</text><rect x="50" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="155" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server A</text><rect x="72" y="120" width="166" height="62" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="155" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="155" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >A</text><rect x="280" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="385" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server B</text><rect x="302" y="120" width="166" height="62" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="385" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="385" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >B</text><rect x="40" y="230" width="450" height="380" rx="12" fill="url(#ts-panel)" stroke="#57929a" stroke-width="2" /><path d="M155 204 L220 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><path d="M385 204 L300 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="130" y="254" width="270" height="66" rx="12" fill="#eaf1f3" stroke="#57929a" stroke-width="2" /><text x="265" y="294" text-anchor="middle" font-size="23" fill="#172b3a" >Time-sliced scheduler</text><path d="M265 322 L265 348" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="70" y="358" width="390" height="84" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" class="ts-box"/><text x="265" y="388" text-anchor="middle" font-size="22" fill="#172b3a" >Shared compute</text><g class="ts-state-a"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A is running</text></g><g class="ts-state-b"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">B is running</text></g><rect x="70" y="466" width="390" height="104" rx="12" fill="#ffffff" stroke="#819eac" stroke-width="2" /><text x="265" y="493" text-anchor="middle" font-size="19" fill="#172b3a" >H100 memory · both models resident</text><rect x="82" y="505" width="172" height="52" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="168" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >A · resident model</text><text x="168" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><rect x="276" y="505" width="172" height="52" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="362" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >B · resident model</text><text x="362" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><text x="265" y="596" text-anchor="middle" font-size="21" fill="#172b3a" font-weight="700">GPU</text><text x="750" y="110" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">On GPU schedule</text><text x="600" y="150" text-anchor="middle" font-size="20" fill="#172b3a" >Time</text><path d="M650 144 L947 144" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><g class="ts-slot-a"><rect x="548" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="573.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="599" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="624.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="650" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="675.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="701" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="726.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="752" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="777.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="803" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="828.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="854" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="879.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="905" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="930.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><text x="752" y="278" text-anchor="middle" font-size="20" fill="#172b3a" >time slice</text><rect x="548" y="322" width="408" height="150" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="752" y="361" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A and B take turns</text><text x="752" y="399" text-anchor="middle" font-size="21" fill="#172b3a" >Only one client uses compute</text><text x="752" y="431" text-anchor="middle" font-size="21" fill="#172b3a" >at a time.</text><g class="ts-state-a"><text x="752" y="530" text-anchor="middle" font-size="23" fill="#172b3a" >A running · B waiting</text></g><g class="ts-state-b"><text x="752" y="530" text-anchor="middle" font-size="23" fill="#172b3a" >B running · A waiting</text></g></svg>
</div>
<figcaption id="timeslicing-story">A uses shared compute while B waits, then they swap. Both models stay resident in memory.</figcaption>
</figure>
</section>
<section id="mps"><h2>MPS</h2>
<p>MPS introduces a client-server architecture to provide concurrency. Under MPS, clients draw from a common pool of connections mapped to GPU work queues and managed by the MPS server. The CUDA driver allocates connections to individual clients, which submit their work directly to the GPU without going through the MPS server.<a href="#source-10">[10]</a> <a href="#source-11">[11]</a></p>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MPS diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mps-volta-architecture.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mps-volta-architecture.svg" width="1000" height="740" loading="lazy" alt="MPS: separate client contexts, address spaces and connections submit work directly to the GPU; dashed paths show server coordination."></a>
</div>
<figcaption>MPS, based on NVIDIA's architecture and connection-pool documentation.<a href="#source-10">[10]</a> <a href="#source-11">[11]</a> Solid arrows show GPU work submission; dashed lines show coordination.</figcaption>
</figure>
<p>MPS provides different ways to restrict compute usage:</p>
<ul>
<li><strong>Active-thread percentage:</strong> Limits the number of GPU threads a client can execute concurrently, expressed as a percentage of the GPU's available execution capacity. For example, a 50% limit restricts how many threads can be active simultaneously, but it does not reserve 50% of the physical SMs or guarantee 50% of GPU performance.<a href="#source-12">[12]</a></li>
<li><strong>Static SM partitioning:</strong> On supported Ampere-and-newer GPUs, assigns specific groups of SMs to different partitions. These SMs are exclusive to their assigned partitions, providing stronger compute isolation and more predictable resource allocation.<a href="#source-12">[12]</a></li>
</ul>
<p>MPS also supports memory-allocation limits. Hard limits are enforced during allocation, preventing clients from allocating more memory than permitted.<a href="#source-12">[12]</a> With MPS v3 memory partitioning, a soft limit represents a protected allocation budget for a cgroup or container that clients can exceed when spare memory is available, up to their hard limit. This feature requires Linux with cgroup v2, CUDA 13.4 or newer, and a non-MIG device.<a href="#source-16">[16]</a></p>
<p>Under actual memory pressure, the MPS server can identify and terminate an eligible client exceeding its soft limit so another client's allocation can be retried. Crossing the soft limit alone does not trigger termination.<a href="#source-16">[16]</a></p>
<p>Neither active-thread percentages nor static SM partitioning guarantees end-to-end performance QoS. These mechanisms do not partition the GPU's memory controllers, L2 cache banks, or HBM bandwidth, meaning clients can still compete for the same memory bandwidth even when their memory allocations and compute resources are restricted.<a href="#source-8">[8]</a></p>
<p>The MPS results below compare active-thread percentages; they do not measure static SM partitioning or MPS v3 soft-limit behavior.</p>
</section>
<section id="mig"><h2>MIG</h2>

<p>MIG essentially divides the GPU into smaller pieces. The available profiles depend on the GPU model, and not all GPUs support MIG. In my case, I created two MIG instances on my H100, one for each client.</p>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MIG diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mig-resource-paths.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mig-resource-paths.svg" width="1000" height="655" loading="lazy" alt="Two 3g.40gb GPU instances with separate paths through the system pipe, crossbar ports, 46 SMs, L2 cache, memory controllers and 40 GB HBM."></a>
</div>
<figcaption>Resource paths inside the two <code>3g.40gb</code> instances used here. Each row has dedicated SMs and isolated crossbar ports, L2 cache banks, memory controllers and HBM.<a href="#source-14">[14]</a></figcaption>
</figure>
<p>The main difference from the other methods is that MIG provides dedicated SM resources and isolated memory-system paths, including L2 cache banks, memory controllers, and DRAM buses. This provides a higher degree of isolation between CUDA processes and, as NVIDIA describes it, a defined level of quality of service (QoS) for compute and memory bandwidth.<a href="#source-14">[14]</a></p><p>This table from NVIDIA summarizes the main differences between the sharing methods.</p><div class="table-wrap" tabindex="0" role="region" aria-label="CUDA concurrency comparison; scroll horizontally on smaller screens"><table class="concurrency-table"><caption>CUDA concurrency mechanisms (adapted for this configuration) <a href="#source-8">[8]</a></caption><thead><tr><th scope="col">Feature</th><th scope="col">Streams</th><th scope="col">MPS</th><th scope="col">MIG</th></tr></thead><tbody><tr><th scope="row">Partition Type</th><td>Single Process</td><td>Logical</td><td>Physical</td></tr><tr><th scope="row">Max Partitions</th><td>Unlimited</td><td>Hardware-dependent</td><td>7</td></tr><tr><th scope="row">SM Performance Isolation</th><td>No</td><td>Resource cap; no dedicated SMs</td><td>Yes</td></tr><tr><th scope="row">Memory Protection</th><td>No</td><td>Yes</td><td>Yes</td></tr><tr><th scope="row">Memory Bandwidth QoS</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Error Isolation</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Cross-Partition Interop</th><td>Always</td><td>IPC</td><td>Limited IPC</td></tr><tr><th scope="row">Reconfigure</th><td>Dynamic</td><td>Process Launch</td><td>When Idle</td></tr></tbody></table></div>

</section>
<section id="dra"><h2>Deploying the lab in Kubernetes with DRA</h2><p>DRA (Dynamic Resource Allocation) made deploying this lab pretty easy.<a href="#source-3">[3]</a> With the traditional device plugin, you could request GPU resources in your Pod, but configurations such as time-slicing and MIG had to be managed separately.<a href="#source-7">[7]</a> With DRA, it's more like using PVCs: you create a ResourceClaim describing the GPU and configuration you want, and Kubernetes, together with the DRA driver, takes care of finding, allocating, and preparing the resources for your Pod.<a href="#source-3">[3]</a></p>
<p>The GPU Operator can install and manage the NVIDIA DRA driver; the driver handles GPU discovery and preparation.<a href="#source-19">[19]</a> The driver advertises devices and their attributes in <code>ResourceSlices</code>. A <code>DeviceClass</code> defines which devices a claim can select. The Kubernetes scheduler matches the <code>ResourceClaim</code> against that inventory and chooses a node. On that node, kubelet asks the DRA driver's plugin to prepare the allocated GPU before the container starts.<a href="#source-3">[3]</a> <a href="#source-18">[18]</a></p>
<figure class="explainer mechanism dra-flow">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="DRA user-flow diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/dra-user-flow.svg"><img class="sharing-diagram" src="/gpu-sharing/images/dra-user-flow.svg" width="1164" height="283" loading="lazy" alt="DRA workflow: install drivers, create DeviceClasses, choose a ResourceClaim for shared devices or a ResourceClaimTemplate for separate devices, attach the claim to a Pod, and deploy the workload."></a>
</div>
<figcaption>DRA setup and claim workflow. Source: Google Cloud.<a href="#source-17">[17]</a></figcaption>
</figure>

<p>These are minimal allocation examples. Replace <code>&lt;your-image&gt;</code> with your inference server image. The sharing-setting links in the results table open the recorded run manifests.</p>
<h3 id="dra-timeslicing">Time-slicing configuration</h3><p>Create a <code>ResourceClaim</code> requesting a GPU shared through time-slicing. You can also configure the interval in that claim.<a href="#source-6">[6]</a></p>
<details class="yaml-example">
<summary>Time-slicing ResourceClaim</summary>
<pre class="claim" tabindex="0"><code>apiVersion: resource.k8s.io/v1
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
<pre class="claim" tabindex="0"><code>apiVersion: v1
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
<p>To share one GPU through the same MPS server, both Pods must reference the same <code>ResourceClaim</code>. A <code>ResourceClaimTemplate</code> creates a separate claim for each Pod, so using the same template does not guarantee the same GPU or MPS daemon.<a href="#source-2">[2]</a></p>
<div class="yaml-pair">
<details class="yaml-example">
<summary>MPS ResourceClaim</summary>
<pre class="claim" tabindex="0"><code>apiVersion: resource.k8s.io/v1
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
</details>
<details class="yaml-example">
<summary>MPS Pod</summary>
<pre class="claim" tabindex="0"><code>apiVersion: v1
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
</div>


<h3 id="dra-mig">MIG configuration</h3>
<p>DRA supports <code>DynamicMIG</code>, so you don't have to partition the GPU yourself. The DRA driver can create MIG partitions automatically based on the requested profile. If you decide to create the partitions manually, you can still request them through DRA, as the driver discovers existing MIG instances at startup and publishes them in <code>ResourceSlices</code>, making them available through the <code>mig.nvidia.com</code> DeviceClass.<a href="#source-18">[18]</a></p>
<p>For MIG, unlike the MPS configuration, I used a <code>ResourceClaimTemplate</code> so that Kubernetes automatically created a separate <code>ResourceClaim</code> for each Pod, giving each inference server its own MIG instance.<a href="#source-3">[3]</a></p>
<details class="yaml-example">
<summary>MIG claim template and Pod</summary>
<pre class="claim" tabindex="0"><code># Template form: Kubernetes creates one ResourceClaim per pod from it.
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
<pre class="claim" tabindex="0"><code># Dynamic MIG: the driver creates a matching partition when the pod is prepared
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
<p>Currently, the NVIDIA DRA driver's <code>MPSSupport</code> and <code>DynamicMIG</code> feature gates are mutually exclusive. This means you cannot use MPS to share a dynamically created MIG slice with this DRA configuration, even though NVIDIA supports running multiple MPS clients within the same MIG slice.<a href="#source-2">[2]</a> <a href="#source-13">[13]</a></p>
<p>You can also compare how MIG was configured with the traditional device plugin: <a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">MIG strategies in Kubernetes</a>. As you can see, with the traditional device plugin, you generally had to define the MIG partitions yourself. With <code>DynamicMIG</code>, the DRA driver can create a partition matching the requested profile on demand.</p>
</section>
<section id="original"><h2>Inference performance</h2>
<p>I used the <a href="https://github.com/SemiAnalysisAI/InferenceX">InferenceX repo</a> and measured output tokens/s and time to first token (TTFT). At five requests per server, MPS 100% had the highest measured throughput: 626 tokens/s, about 25.7% above time-slicing Default at 498. MIG reached 594 tokens/s, about 19.3% above Default; MPS 100% was about 5.4% above MIG. MPS 50% was also close at 611 tokens/s.</p><p>Time-slicing Short and Long were slower in these runs and drew less power in the <a href="#gpu-captures">recorded nvidia-smi snapshots</a>: 182 W and 186 W, respectively, versus 338 W for Default. I haven't established why they were slower. These are comparisons for this workload and configuration. The table reports medians without variability, so I can't claim statistical significance. The chart also includes a model-alone run, but that single-server workload isn't a like-for-like dedicated-GPU baseline for these two-server totals.</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Inference results; scroll horizontally on smaller screens"><table class="performance-table"><caption>1,024 input / 1,024 output tokens. Medians of three repeats at five requests per server.</caption><thead><tr><th scope="col">Sharing setting</th><th scope="col">Total output (tokens/s)</th><th scope="col">p95 first-token wait (ms)</th></tr></thead><tbody><tr><th scope="row">Time-slicing Default</th><td>498</td><td>471</td></tr><tr><th scope="row">Time-slicing Short</th><td>385</td><td>1,387</td></tr><tr><th scope="row">Time-slicing Long</th><td>413</td><td>1,400</td></tr><tr><th scope="row">MPS 25%</th><td>513</td><td>516</td></tr><tr><th scope="row">MPS 50%</th><td>611</td><td>392</td></tr><tr><th scope="row">MPS 100%</th><td>626</td><td>376</td></tr><tr><th scope="row">MIG: two 3g.40gb slices</th><td>594</td><td>394</td></tr></tbody></table></div>


<iframe class="performance-chart" title="All H100 sharing settings and model alone, with family visibility toggles" src="/gpu-sharing/combined.html" loading="lazy"></iframe></section>
<section id="interpretation"><div id="gpu-captures"><div>Here you can check the recorded <code>nvidia-smi</code> output for each sharing method.</div><div class="gpu-modes" role="group" aria-label="GPU capture mode"></div><p role="status"></p><pre tabindex="0" aria-label="Recorded nvidia-smi output"><code></code></pre></div>
<script src="/js/gpu-captures-bundled.js"></script>
<p>With MPS, the percentage configured for a client is what changes its resource usage: server A's device probes reported 28 multiprocessors at MPS 25% and 114 at MPS 100%. Those counts reflect the execution-resource limit, not ownership of that many exclusive physical SMs.<a href="#source-12">[12]</a></p></section>



<section id="security"><h2>Security considerations</h2>
<p>MIG's hardware isolation matters: separate GPU instances get dedicated SM resources and isolated memory-system paths. MPS active-thread limits don't provide those same boundaries.<a href="#source-14">[14]</a> That still leaves the security of the complete deployment: the host, driver, firmware, device access and tenant configuration all matter. Hardware resource isolation alone doesn't establish that the whole system is secure.</p><p>I found these two discussions useful for thinking about the wider deployment risks.<a href="#source-4">[4]</a> <a href="#source-5">[5]</a> I wouldn't use them to dismiss MIG's hardware isolation or treat it as equivalent to MPS.</p>
<p>Sharing the GPU is only part of the problem. Two inference servers can also compete for CPU time, host memory bandwidth, PCIe transfers and storage I/O. MIG isolates resources inside the GPU, but it doesn't give each tenant a separate host.<a href="#source-14">[14]</a> In a larger cluster, placement matters too: distributed jobs can compete for network bandwidth, so choosing where jobs run becomes part of the performance problem.<a href="#source-15">[15]</a> I haven't measured those effects here; this experiment compares two instances of Nemotron 32B on one H100.</p></section>
<section id="conclusions"><h2>Conclusions</h2>
<p>The most interesting part of this experiment for me was DRA: setting these resources dynamically was pretty cool. Some features I used are still alpha, and the mutually exclusive <code>MPSSupport</code> and <code>DynamicMIG</code> gates were a practical limitation.<a href="#source-2">[2]</a> MPS inside MIG is supported by NVIDIA; that broader capability wasn't what this DRA setup tested.<a href="#source-13">[13]</a></p>
<p>For these two instances of Nemotron 32B, MPS 100% gave the highest measured throughput at five requests per server, and MIG was relatively close: 626 versus 594 tokens/s. Both beat time-slicing Default at 498 tokens/s. That's a useful result for this workload and configuration, though it doesn't establish a general winner or how either compares with a comparable dedicated-GPU deployment.</p>
<p>The choice also depends on isolation: MIG partitions hardware resources, while the MPS active-thread settings here cap usage on shared resources. CERN's talk gives another example of sharing GPUs between experiment teams that underutilize their allocations.<a href="#source-9">[9]</a> Bare-metal deployment is a separate choice from GPU sharing: both MPS and MIG can run on bare metal.<a href="#source-1">[1]</a> <a href="#source-14">[14]</a></p>
<p>Thank you for reading my blog. This is my first time! Hehe.</p></section>
<section id="sources"><h2>Sources</h2><ol class="small">
<li id="source-1"><a href="https://docs.nvidia.com/deploy/mps/latest/index.html">NVIDIA Multi-Process Service guide</a> <a href="/gpu-sharing/NVIDIA-CUDA-MPS-Guide.pdf">Saved PDF</a></li>
<li id="source-2"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/mps/">DRA Driver for NVIDIA GPUs: GPU sharing with Multi-Process Service</a></li>
<li id="source-3"><a href="https://kubernetes.io/docs/concepts/resource-management/dynamic-resource-allocation/">Kubernetes: Dynamic Resource Allocation</a></li>
<li id="source-4"><a href="https://www.linkedin.com/pulse/mig-complete-security-boundary-hardware-partitioning-shared-daula-slbac/">MIG Is Not a Complete Security Boundary</a></li>
<li id="source-5"><a href="https://www.linkedin.com/pulse/gpus-security-boundary-its-architectural-gaps-run-all-kavitha-daula-3zvoe/">GPUs Are Not a Security Boundary and Its Architectural Gaps Run All the Way Down</a></li>
<li id="source-6"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/gpu-allocation/time-slicing/">DRA Driver for NVIDIA GPUs: Time-slicing</a></li>
<li id="source-7"><a href="https://github.com/NVIDIA/k8s-device-plugin/blob/main/README.md#shared-access-to-gpus">NVIDIA device plugin for Kubernetes: Shared Access to GPUs</a></li>
<li id="source-8"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/concepts.html#cuda-concurrency-mechanisms">NVIDIA: CUDA concurrency mechanisms and shared memory-system resources</a></li>
<li id="source-9"><a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ">GPU Sharing at CERN: Cutting the Cake Without Losing a Slice!</a>, Diana Gaponcic, KubeCon EU 2025.</li>
<li id="source-10"><a href="https://docs.nvidia.com/deploy/mps/latest/architecture.html">NVIDIA MPS: Architecture</a></li>
<li id="source-11"><a href="https://docs.nvidia.com/deploy/mps/latest/appendix-environment-variables.html">NVIDIA MPS: Environment variables and connection pools</a></li>
<li id="source-12"><a href="https://docs.nvidia.com/deploy/mps/latest/when-to-use-mps.html">NVIDIA MPS: Execution-resource provisioning</a></li>
<li id="source-13"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/getting-started-with-mig.html#mig-with-cuda-mps">NVIDIA MIG: Running MPS inside MIG instances</a></li>
<li id="source-14"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/introduction.html">NVIDIA MIG: Hardware isolation and deployment options</a></li>
<li id="source-15"><a href="https://arxiv.org/abs/2310.20209">Network Contention-Aware Cluster Scheduling with Reinforcement Learning</a></li>
<li id="source-16"><a href="https://docs.nvidia.com/deploy/mps/latest/mpsv3-memory-partitioning.html">NVIDIA MPS v3: Memory partitioning, hard/soft limits and pressure handling</a></li>
<li id="source-17"><a href="https://docs.cloud.google.com/static/kubernetes-engine/images/dra-user-flow.svg">Google Cloud: DRA user-flow diagram</a></li>
<li id="source-18"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/concepts/gpu-allocation/">NVIDIA DRA driver: Static and dynamic MIG discovery and allocation</a></li>
<li id="source-19"><a href="https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/dra-intro-install.html">NVIDIA GPU Operator: Installing and managing the DRA driver</a></li>
</ol></section>
</div>


<script src="/js/yaml-highlight.js"></script>
<script src="/js/workshop-video.js"></script>
<script src="/js/resource-yaml.js"></script>
<script src="/js/calm-sharing.js"></script>
<script>(function(){var bar=document.querySelector(".gpu-article .reading-progress-bar");if(!bar)return;var article=document.querySelector(".gpu-article");function u(){var r=article.getBoundingClientRect();var total=r.height-window.innerHeight;var done=Math.min(Math.max(-r.top,0),Math.max(total,0));bar.style.width=(total>0?done/total*100:0)+"%";}window.addEventListener("scroll",u,{passive:true});window.addEventListener("resize",u);u();})();</script>
