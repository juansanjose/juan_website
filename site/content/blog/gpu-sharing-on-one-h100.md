+++
title = "Model inference on a shared GPU"
slug = "model-inferencing-on-a-shared-gpu"
date = 2026-11-05
url = "/blog/2026/10/model-inferencing-on-a-shared-gpu/"
description = "Time-slicing, MPS and MIG on one rented H100, deployed with Kubernetes DRA."
+++

<div class="gpu-article">
<p>GPU utilization and resource management depend on the applications running on the GPU. Some applications consume all available GPU resources and scale across multiple GPUs, while others require only a fraction of the GPU's resources or do not use the GPU continuously.</p>
<p>To improve resource utilization, NVIDIA GPUs support several mechanisms that allow multiple processes to share the same GPU: time-sliced context switching, CUDA Multi-Process Service (MPS), and Multi-Instance GPU (MIG).</p>
<p>After reading <a href="https://developer.nvidia.com/blog/maximize-ai-infrastructure-throughput-by-consolidating-underutilized-gpu-workloads/">NVIDIA's post on consolidating underutilized GPU workloads</a>, I wanted to try it for myself. I ran two instances of Nemotron 32B on one H100 and compared their inference performance with each sharing method.</p>

<div class="reading-progress" aria-hidden="true"><span class="reading-progress-bar"></span></div>
<nav class="toc" aria-label="Contents"><p><strong>Contents</strong></p><ol><li><a href="#timeslicing">Time-slicing</a></li><li><a href="#mps">MPS</a></li><li><a href="#mig">MIG</a></li><li><a href="#dra">Deploying the lab in Kubernetes with DRA</a><ol><li><a href="#dra-timeslicing">Time-slicing configuration</a></li><li><a href="#dra-mps">MPS configuration</a></li><li><a href="#dra-mig">MIG configuration</a></li></ol></li><li><a href="#original">Inference performance</a></li><li><a href="#workload-choice">Use cases</a></li><li><a href="#security">Security considerations</a></li><li><a href="#conclusions">Conclusions</a></li><li><a href="#sources">Sources</a></li></ol></nav>

<section id="timeslicing"><h2>Time-slicing</h2>

<p>This is the simplest method: processes take turns executing on the GPU, while their allocated memory remains resident. The GPU switches between CUDA contexts, meaning that one process's kernels generally have to wait while another process is executing. This introduces context-switching overhead and prevents the processes from executing their kernels concurrently.<a href="#source-1">[1]</a></p>
<p>The problem is that if a process decides to be a greedy goblin, it can allocate as much of the available GPU memory as it wants, leaving other processes starving for memory. Time-slicing neither provides per-process memory limits nor automatically reclaims those allocations.<a href="#source-1">[1]</a></p>
<p>You can change the turn length. The presets are <code>Default</code>, <code>Short</code>, <code>Medium</code> or <code>Long</code><a href="#source-1">[1]</a>, which correspond to this setting on the host:</p>
<pre class="console-command" tabindex="0" aria-label="Time-slice command and option values"><code>nvidia-smi compute-policy --set-timeslice 3
0=DEFAULT · 1=SHORT · 2=MEDIUM · 3=LONG</code></pre>
<figure class="explainer mechanism" aria-labelledby="ts-t">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="Time-slicing diagram; scroll sideways on smaller screens">
<svg class="sharing-diagram ts-diagram" viewBox="0 0 1000 640" role="img" aria-labelledby="ts-t ts-d" style="font-family:Arial,Helvetica,sans-serif"><title id="ts-t">Time-slicing: A and B take turns on shared compute</title><desc id="ts-d">Two model servers have separate CUDA contexts. Their GPU compute takes turns while both resident models and their working memory remain allocated. The animation alternates the running client.</desc><defs><linearGradient id="ts-panel" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#eef5f7"/></linearGradient><marker id="ts-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#172b3a"/></marker></defs><rect width="1000" height="640" fill="#f7fafb"/><text x="260" y="40" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">Two model servers</text><rect x="50" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="155" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server A</text><rect x="72" y="120" width="166" height="62" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="155" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="155" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >A</text><rect x="280" y="62" width="210" height="142" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="385" y="98" text-anchor="middle" font-size="23" fill="#172b3a" font-weight="700">Model server B</text><rect x="302" y="120" width="166" height="62" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="385" y="146" text-anchor="middle" font-size="20" fill="#172b3a" >CUDA context</text><text x="385" y="171" text-anchor="middle" font-size="22" fill="#172b3a" >B</text><rect x="40" y="230" width="450" height="380" rx="12" fill="url(#ts-panel)" stroke="#57929a" stroke-width="2" /><path d="M155 204 L220 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><path d="M385 204 L300 248" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="130" y="254" width="270" height="66" rx="12" fill="#eaf1f3" stroke="#57929a" stroke-width="2" /><text x="265" y="294" text-anchor="middle" font-size="23" fill="#172b3a" >Time-sliced scheduler</text><path d="M265 322 L265 348" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><rect x="70" y="358" width="390" height="84" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" class="ts-box"/><text x="265" y="388" text-anchor="middle" font-size="22" fill="#172b3a" >Shared compute</text><g class="ts-state-a"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A is running</text></g><g class="ts-state-b"><text x="265" y="421" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">B is running</text></g><rect x="70" y="466" width="390" height="104" rx="12" fill="#ffffff" stroke="#819eac" stroke-width="2" /><text x="265" y="493" text-anchor="middle" font-size="19" fill="#172b3a" >H100 memory · both models resident</text><rect x="82" y="505" width="172" height="52" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="168" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >A · resident model</text><text x="168" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><rect x="276" y="505" width="172" height="52" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="362" y="526" text-anchor="middle" font-size="17" fill="#172b3a" >B · resident model</text><text x="362" y="548" text-anchor="middle" font-size="17" fill="#172b3a" >+ working memory</text><text x="265" y="596" text-anchor="middle" font-size="21" fill="#172b3a" font-weight="700">GPU</text><text x="750" y="110" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">On GPU schedule</text><text x="600" y="150" text-anchor="middle" font-size="20" fill="#172b3a" >Time</text><path d="M650 144 L947 144" fill="none" stroke="#172b3a" stroke-width="2.5" marker-end="url(#ts-arrow)"/><g class="ts-slot-a"><rect x="548" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="573.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="599" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="624.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="650" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="675.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="701" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="726.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="752" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="777.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="803" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="828.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><g class="ts-slot-a"><rect x="854" y="180" width="51" height="64" rx="12" fill="#f5d4de" stroke="#f46b68" stroke-width="2" /><text x="879.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >A</text></g><g class="ts-slot-b"><rect x="905" y="180" width="51" height="64" rx="12" fill="#e3efc7" stroke="#8fbd60" stroke-width="2" /><text x="930.5" y="221" text-anchor="middle" font-size="24" fill="#172b3a" >B</text></g><text x="752" y="278" text-anchor="middle" font-size="20" fill="#172b3a" >time slice</text><rect x="548" y="322" width="408" height="150" rx="12" fill="url(#ts-panel)" stroke="#819eac" stroke-width="2" /><text x="752" y="361" text-anchor="middle" font-size="24" fill="#172b3a" font-weight="700">A and B take turns</text><text x="752" y="399" text-anchor="middle" font-size="21" fill="#172b3a" >Only one client uses compute</text><text x="752" y="431" text-anchor="middle" font-size="21" fill="#172b3a" >at a time.</text></svg>
</div>
<figcaption>Time-slicing alternates execution between CUDA contexts while both models remain resident in GPU memory. <a href="#source-1">[1]</a></figcaption>
</figure>
</section>
<section id="mps"><h2>MPS</h2>
<p>MPS introduces a client-server architecture to allow multiple CUDA processes to execute concurrently on the same GPU. Under MPS, clients draw from a common pool of connections mapped to GPU work queues. The MPS server manages the shared scheduling resources, while clients get assigned connections. Once connected, clients submit their work directly to the GPU without passing every kernel launch through the MPS server.<a href="#source-2">[2]</a> <a href="#source-3">[3]</a></p>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MPS diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mps-volta-architecture.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mps-volta-architecture.svg" width="1000" height="740" loading="lazy" alt="MPS: separate client contexts, address spaces and connections submit work directly to the GPU; dashed paths show server coordination."></a>
</div>
<figcaption>MPS clients submit work directly through their assigned GPU connections, while the server manages shared scheduling resources. <a href="#source-2">[2]</a> <a href="#source-3">[3]</a></figcaption>
</figure>
<p>MPS provides different ways to restrict resource usage:</p>
<ul>
<li><strong>Active-thread percentage:</strong> Limits the execution resources available to a client. For example, setting the limit to 50% restricts the client to approximately half of the GPU's available execution capacity. However, this does not reserve a fixed half of the physical SMs, as different clients can still execute on the same SMs.<a href="#source-4">[4]</a></li>
<li><strong>Static SM partitioning:</strong> Specific groups of SMs are assigned to different partitions. These SMs are exclusive to their assigned partitions, providing stronger compute isolation and more predictable resource allocation.<a href="#source-4">[4]</a></li>
<li><strong>Memory-allocation limits:</strong> There are hard and soft limits. Hard limits are enforced during allocation, preventing clients from allocating more memory than permitted.<a href="#source-4">[4]</a> Soft limits, on the other hand, represent a protected allocation budget for a cgroup or container. Clients can exceed that budget when spare memory is available, up to their hard limit.<a href="#source-5">[5]</a></li>
</ul>
<p>Neither active-thread percentages nor static SM partitioning guarantees end-to-end performance QoS. These mechanisms do not partition the GPU's memory controllers, L2 cache banks, or HBM bandwidth, meaning clients can still compete for the same memory bandwidth even when their memory allocations and compute resources are restricted.<a href="#source-6">[6]</a></p>
</section>
<section id="mig"><h2>MIG</h2>

<p>MIG essentially divides the GPU into smaller pieces. The available profiles depend on the GPU model, and not all GPUs support MIG. In my case, I created two MIG instances on my H100, one for each client.</p>
<figure class="explainer mechanism">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="MIG diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/mig-resource-paths.svg"><img class="sharing-diagram" src="/gpu-sharing/images/mig-resource-paths.svg" width="1000" height="597" loading="lazy" alt="Two 3g.40gb GPU instances with separate paths through the system pipe, crossbar ports, 46 SMs, L2 cache, memory controllers and 40 GB HBM."></a>
</div>
<figcaption>Two separate MIG GPU Instances, each with dedicated SMs and isolated memory-system resources. <a href="#source-7">[7]</a></figcaption>
</figure>
<p>The main difference from the other methods is that MIG physically partitions the GPU, providing each GPU Instance with dedicated SM resources and isolated memory-system paths, including L2 cache banks, memory controllers, and DRAM buses.<a href="#source-7">[7]</a></p>
<p>MIG provides predictable performance or, in NVIDIA's words, a "defined level of QoS".<a href="#source-7">[7]</a></p><p>This table from NVIDIA summarizes the main differences between the sharing methods.</p><div class="table-wrap" tabindex="0" role="region" aria-label="CUDA concurrency comparison; scroll horizontally on smaller screens"><table class="concurrency-table"><caption>CUDA concurrency mechanisms (adapted for this configuration) <a href="#source-6">[6]</a></caption><thead><tr><th scope="col">Feature</th><th scope="col">Streams</th><th scope="col">MPS</th><th scope="col">MIG</th></tr></thead><tbody><tr><th scope="row">Partition Type</th><td>Single Process</td><td>Logical</td><td>Physical</td></tr><tr><th scope="row">Max Partitions</th><td>Unlimited</td><td>Hardware-dependent</td><td>7</td></tr><tr><th scope="row">SM Performance Isolation</th><td>No</td><td>Resource cap; no dedicated SMs</td><td>Yes</td></tr><tr><th scope="row">Memory Protection</th><td>No</td><td>Yes</td><td>Yes</td></tr><tr><th scope="row">Memory Bandwidth QoS</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Error Isolation</th><td>No</td><td>No</td><td>Yes</td></tr><tr><th scope="row">Cross-Partition Interop</th><td>Always</td><td>IPC</td><td>Limited IPC</td></tr><tr><th scope="row">Reconfigure</th><td>Dynamic</td><td>Process Launch</td><td>When Idle</td></tr></tbody></table></div>

</section>
<section id="dra"><h2>Deploying the lab in Kubernetes with DRA</h2><p>DRA (Dynamic Resource Allocation) made deploying this lab pretty easy.<a href="#source-8">[8]</a> With the traditional device plugin, you could request GPU resources in your Pod, but configurations such as time-slicing and MIG generally had to be managed separately.<a href="#source-9">[9]</a></p>
<p>With DRA, it's more like using PVCs. The NVIDIA DRA driver discovers the available GPUs and publishes them through <code>ResourceSlices</code>. You create a <code>ResourceClaim</code> describing the GPU and configuration you want, and Kubernetes uses the published resources to find and allocate a matching device. Finally, the kubelet calls the DRA driver to prepare the GPU for your Pod.<a href="#source-8">[8]</a> <a href="#source-10">[10]</a></p>
<figure class="explainer mechanism dra-flow">
<div class="sharing-diagram-scroll" tabindex="0" role="region" aria-label="DRA user-flow diagram; scroll sideways on smaller screens">
<a href="/gpu-sharing/images/dra-user-flow.svg"><img class="sharing-diagram" src="/gpu-sharing/images/dra-user-flow.svg" width="1164" height="283" loading="lazy" alt="DRA workflow: install drivers, create DeviceClasses, choose a ResourceClaim for shared devices or a ResourceClaimTemplate for separate devices, attach the claim to a Pod, and deploy the workload."></a>
</div>
<figcaption>DRA setup and claim workflow. Source: Google Cloud.<a href="#source-11">[11]</a></figcaption>
</figure>

<h3 id="dra-timeslicing">Time-slicing configuration</h3><p>Create a <code>ResourceClaim</code> requesting a GPU shared through time-slicing. You can also configure the interval in that claim.<a href="#source-1">[1]</a></p>
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
<p>To share one GPU through the same MPS server, both Pods must reference the same <code>ResourceClaim</code>. A <code>ResourceClaimTemplate</code> creates a separate claim for each Pod, so using the same template does not guarantee the same GPU or MPS daemon.<a href="#source-12">[12]</a></p>
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
<p>DRA supports <code>DynamicMIG</code>, so you don't have to partition the GPU yourself. The DRA driver can create MIG partitions automatically based on the requested profile. If you decide to create the partitions manually, you can still request them through DRA, as the driver discovers existing MIG instances at startup and publishes them in <code>ResourceSlices</code>, making them available through the <code>mig.nvidia.com</code> DeviceClass.<a href="#source-10">[10]</a></p>
<p>For MIG, unlike the MPS configuration, I used a <code>ResourceClaimTemplate</code> so that Kubernetes automatically created a separate <code>ResourceClaim</code> for each Pod, giving each inference server its own MIG instance.<a href="#source-8">[8]</a></p>
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
<p>Currently, the NVIDIA DRA driver's <code>MPSSupport</code> and <code>DynamicMIG</code> feature gates are mutually exclusive. This means you cannot use MPS to share a dynamically created MIG slice with this DRA configuration, even though NVIDIA supports running multiple MPS clients within the same MIG slice.<a href="#source-12">[12]</a> <a href="#source-13">[13]</a></p>
<p>You can also compare how MIG was configured with the traditional device plugin: <a href="https://docs.nvidia.com/datacenter/cloud-native/kubernetes/latest/index.html#using-mig-strategies-in-kubernetes">MIG strategies in Kubernetes</a>. As you can see, with the traditional device plugin, you had to define the MIG partitions yourself. With <code>DynamicMIG</code>, the DRA driver can create a partition matching the requested profile on demand.</p>
</section>
<section id="original"><h2>Inference performance</h2>
<p>I used the <a href="https://github.com/SemiAnalysisAI/InferenceX">InferenceX repo</a> and measured output tokens/s and time to first token (TTFT). <strong>For the sharing runs, tokens/s is the sum of the output throughput from both model instances on the H100.</strong> At five requests per server, MPS 100% had the highest measured throughput: 626 tokens/s, about 25.7% above time-slicing Default at 498. MIG reached 594 tokens/s, about 19.3% above Default; MPS 100% was about 5.4% above MIG. MPS 50% was also close at 611 tokens/s.</p><p>Time-slicing Short and Long were slower in these runs and drew less power in the <a href="#gpu-captures">recorded nvidia-smi snapshots</a>: 182 W and 186 W, respectively, versus 338 W for Default. I haven't established why that happens.</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="Inference results; scroll horizontally on smaller screens"><table class="performance-table"><caption>1,024 input / 1,024 output tokens. Medians of three repeats at five requests per server. Sharing runs use two model instances; model alone uses one.</caption><thead><tr><th scope="col">Sharing setting</th><th scope="col">Total output (tokens/s)</th><th scope="col">p95 first-token wait (ms)</th></tr></thead><tbody><tr><th scope="row">Time-slicing Default</th><td>498</td><td>471</td></tr><tr><th scope="row">Time-slicing Short</th><td>385</td><td>1,387</td></tr><tr><th scope="row">Time-slicing Long</th><td>413</td><td>1,400</td></tr><tr><th scope="row">MPS 25%</th><td>513</td><td>516</td></tr><tr><th scope="row">MPS 50%</th><td>611</td><td>392</td></tr><tr><th scope="row">MPS 100%</th><td>626</td><td>376</td></tr><tr><th scope="row">MIG: two 3g.40gb slices</th><td>594</td><td>394</td></tr><tr><th scope="row">Model alone (one instance)</th><td>493</td><td>277</td></tr></tbody></table></div>


<iframe class="performance-chart" title="All H100 sharing settings and model alone, with family visibility toggles" src="/gpu-sharing/combined.html" loading="lazy"></iframe>
<p>At five requests per server, I see higher combined output with MPS and MIG than with the model running alone, but a longer time to first token. I'm getting more throughput out of the GPU at the cost of latency. This could indicate better GPU utilization, but the shared runs also have twice as many requests in flight. Memory contention could contribute to the slower TTFT, but these results don't establish that cause.</p></section>
<section id="interpretation"><div id="gpu-captures"><div class="gpu-capture-intro">Here you can check the recorded <code>nvidia-smi</code> output for each sharing method.</div><div class="gpu-capture-panel"><div class="gpu-modes" role="group" aria-label="GPU capture mode"></div><p role="status"></p><pre tabindex="0" aria-label="Recorded nvidia-smi output"><code></code></pre></div></div>
<script src="/js/gpu-captures-bundled.js"></script>
<p>With MPS, the percentage configured for a client is what changes its resource usage: server A's device probes reported 28 multiprocessors at MPS 25% and 114 at MPS 100%. Those counts reflect the execution-resource limit, not ownership of that many exclusive physical SMs.<a href="#source-4">[4]</a></p></section>



<section id="workload-choice"><h2>Use cases</h2>
<p>I wouldn't consider these techniques for inference workloads where a single model already keeps the GPU pretty busy. Sharing has more appeal when individual workloads leave spare capacity.</p>
<p>NVIDIA also compared these sharing methods at KubeCon North America 2024, and the results varied quite a bit depending on the workload.<a href="#source-14">[14]</a></p>
<p>CERN's presentation showed the results of two HPC applications. Their results suggest that compute-heavy applications can perform well with GPU sharing, whereas memory-bound applications can experience higher levels of performance degradation.<a href="#source-15">[15]</a></p>
<p>In general, I'd choose time-slicing for occasional development work that can tolerate variable performance, you can assign multiple Pods to the same GPU. MPS for multiple CUDA processes that benefit from running concurrently, although its setup is more complex because it requires a control daemon and server. Finally MIG, which I personally find quite straightforward, especially with DynamicMIG, since you can create partitions automatically and get more predictable compute and memory-bandwidth performance.<a href="#source-7">[7]</a></p>
</section>
<section id="security"><h2>Security considerations</h2>
<p>With MIG, CUDA processes running in separate GPU Instances have hardware-level memory isolation, so one process cannot read another's GPU memory.<a href="#source-7">[7]</a> However, MIG doesn't isolate every part of the GPU or host, so it isn't a complete security boundary.</p>
<p>I found these two LinkedIn articles discussing the security limitations of MIG and GPU sharing, and I think they're worth a read.<a href="#source-16">[16]</a> <a href="#source-17">[17]</a> They explain how resources such as the PCIe link, DMA infrastructure, firmware, and parts of the GPU control plane remain shared, potentially introducing side channels and other security risks.</p>
<p>Another option is GPU virtualization. With GPU passthrough, a VM normally gets an entire physical GPU, while NVIDIA vGPU allows several VMs to share it,  through MIG-backed or time-scheduled vGPUs.<a href="#source-18">[18]</a> This adds VM-level isolation, but you also have more components to secure, such as the vGPU manager and hypervisor, which can have their own vulnerabilities.<a href="#source-19">[19]</a></p></section>
<section id="conclusions"><h2>Conclusions</h2>
<p>For me, the most interesting part of this experiment was DRA: setting these resources dynamically is more aligned with what I do as a DevOps engineer. However, some features I used are still alpha, and my agents got confused by the mutually exclusive <code>MPSSupport</code> and <code>DynamicMIG</code> gates.<a href="#source-12">[12]</a></p>
<p>For these two instances of Nemotron 32B, MPS 100% achieved the highest measured throughput, with MIG relatively close behind. Both performed better than time-slicing.</p>
<p>In summary, MIG partitions hardware resources, while the MPS active-thread settings cap usage on shared resources.<a href="#source-7">[7]</a></p>
<p>Thank you for reading my blog. This is my first time! Hehe.</p></section>
<section id="sources"><h2>Sources</h2><ol class="small">
<li id="source-1"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/gpu-allocation/time-slicing/">DRA Driver for NVIDIA GPUs: Time-slicing</a></li>
<li id="source-2"><a href="https://docs.nvidia.com/deploy/mps/latest/architecture.html">NVIDIA MPS: Architecture</a></li>
<li id="source-3"><a href="https://docs.nvidia.com/deploy/mps/latest/appendix-environment-variables.html">NVIDIA MPS: Environment variables and connection pools</a></li>
<li id="source-4"><a href="https://docs.nvidia.com/deploy/mps/latest/when-to-use-mps.html">NVIDIA MPS: Execution-resource provisioning</a></li>
<li id="source-5"><a href="https://docs.nvidia.com/deploy/mps/latest/mpsv3-memory-partitioning.html">NVIDIA MPS v3: Memory partitioning, hard/soft limits and pressure handling</a></li>
<li id="source-6"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/concepts.html#cuda-concurrency-mechanisms">NVIDIA: CUDA concurrency mechanisms and shared memory-system resources</a></li>
<li id="source-7"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/introduction.html">NVIDIA MIG: Hardware isolation and deployment options</a></li>
<li id="source-8"><a href="https://kubernetes.io/docs/concepts/resource-management/dynamic-resource-allocation/">Kubernetes: Dynamic Resource Allocation</a></li>
<li id="source-9"><a href="https://github.com/NVIDIA/k8s-device-plugin/blob/main/README.md#shared-access-to-gpus">NVIDIA device plugin for Kubernetes: Shared Access to GPUs</a></li>
<li id="source-10"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/concepts/gpu-allocation/">NVIDIA DRA driver: Static and dynamic MIG discovery and allocation</a></li>
<li id="source-11"><a href="https://docs.cloud.google.com/static/kubernetes-engine/images/dra-user-flow.svg">Google Cloud: DRA user-flow diagram</a></li>
<li id="source-12"><a href="https://dra-driver-nvidia-gpu.sigs.k8s.io/docs/guides/mps/">DRA Driver for NVIDIA GPUs: GPU sharing with Multi-Process Service</a></li>
<li id="source-13"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/getting-started-with-mig.html#mig-with-cuda-mps">NVIDIA MIG: Running MPS inside MIG instances</a></li>
<li id="source-14"><a href="https://static.sched.com/hosted_files/kccncna2024/fd/KCNA24-DRA-Benchmarking.pdf">Which GPU Sharing Strategy Is Right for You? A Benchmark Study Using DRA</a>, Kevin Klues and Yuan Chen, NVIDIA, KubeCon North America 2024. Inference results: slides 63–68; small matrix-multiplication jobs: slides 70, 73–75.</li>
<li id="source-15"><a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ">GPU Sharing at CERN: Cutting the Cake Without Losing a Slice!</a>, Diana Gaponcic, KubeCon EU 2025. Benchmark results: <a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ&amp;t=1160s">time-slicing, 19:20</a>; <a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ&amp;t=1260s">two-process MPS, 21:00</a>; <a href="https://www.youtube.com/watch?v=_pgOuaYwvBQ&amp;t=1300s">four-process MPS, 21:40</a>.</li>
<li id="source-16"><a href="https://www.linkedin.com/pulse/mig-complete-security-boundary-hardware-partitioning-shared-daula-slbac/">MIG Is Not a Complete Security Boundary</a></li>
<li id="source-17"><a href="https://www.linkedin.com/pulse/gpus-security-boundary-its-architectural-gaps-run-all-kavitha-daula-3zvoe/">GPUs Are Not a Security Boundary and Its Architectural Gaps Run All the Way Down</a></li>
<li id="source-18"><a href="https://docs.nvidia.com/datacenter/tesla/mig-user-guide/virtualization.html">NVIDIA MIG: GPU passthrough and MIG-backed vGPUs</a></li>
<li id="source-19"><a href="https://github.com/NVIDIA/product-security/blob/main/2026/5821/5821.md">NVIDIA security bulletin: GPU display drivers and vGPU software, May 2026</a></li>
</ol></section>
</div>


<script src="/js/yaml-highlight.js"></script>
<script src="/js/workshop-video.js"></script>
<script src="/js/resource-yaml.js"></script>
<script src="/js/calm-sharing.js"></script>
<script src="/js/diagram-controls.js" defer></script>
<script src="/js/reading-progress.js"></script>
