SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Table structure for table `events`
--
CREATE TABLE `events` (
  `id_event` int(11) NOT NULL AUTO_INCREMENT,
  `nama_event` varchar(100) NOT NULL,
  `poster` varchar(255) DEFAULT NULL,
  `link_gform` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `events`
--
INSERT INTO `events` (`id_event`, `nama_event`, `poster`, `link_gform`) VALUES
(1, 'natal', '1760289952826.png', 'https://forms.gle/hKRW58CAzsbkXnkh7');

--
-- Table structure for table `gallery_items`
--
CREATE TABLE `gallery_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_path` varchar(255) NOT NULL,
  `file_type` enum('image','video') NOT NULL,
  `caption` varchar(255) DEFAULT NULL,
  `event_name` varchar(100) DEFAULT NULL,
  `upload_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gallery_items`
--
INSERT INTO `gallery_items` (`id`, `file_path`, `file_type`, `caption`, `event_name`, `upload_date`) VALUES
(2, '/galleryMedia/mediaFile-1760955574035-662984548.png', 'image', 'natal', 'natal', '2025-10-20 10:19:34');

--
-- Table structure for table `kritik_saran`
--
CREATE TABLE `kritik_saran` (
  `id_saran` int(11) NOT NULL AUTO_INCREMENT,
  `isi_saran` text NOT NULL,
  `tanggal_kirim` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id_saran`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Table structure for table `users`
--
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_lengkap` varchar(100) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','jemaat') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--
INSERT INTO `users` (`id`, `nama_lengkap`, `username`, `password`, `role`) VALUES
(2, 'hanna pauline', 'Hanna', '$2b$10$8CPoW918y6Xmo8/adDZyQe2IRITML5.rBbR7BCIVypu6xiK/yVUaC', 'jemaat'),
(3, 'Admin Gereja', 'admin', '$2b$10$fDEF2GyN8t.vlBsCxfxiRuD/A8Id71acv3qVdw/4xRoW62XuLplgi', 'admin'),
(6, 'hanna pauline', 'hana', '$2b$10$ttPLK.4L18iUWNv5zln73ut98Pw0wiOHnkqJdLzSVHaZBYzLMqjU2', 'jemaat'),
(7, 'Daveed Arden Tulungallo', 'daverdn', '$2b$10$P6JYahLDEIC6yuqjoPdPmeJC6OuY4EAz1uCqL6tjWVrFgCcoUv/fa', 'jemaat');

--
-- Table structure for table `master_jemaat`
--
CREATE TABLE `master_jemaat` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_lengkap` varchar(100) NOT NULL,
  `alamat` text DEFAULT NULL,
  `nomor_telepon` varchar(20) DEFAULT NULL,
  `tempat_lahir` varchar(50) DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `jenis_kelamin` enum('Laki-laki','Perempuan') DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `foto_profile_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `master_jemaat_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `master_jemaat`
--
INSERT INTO `master_jemaat` (`id`, `nama_lengkap`, `alamat`, `nomor_telepon`, `tempat_lahir`, `tanggal_lahir`, `jenis_kelamin`, `email`, `user_id`, `foto_profile_url`) VALUES
(2, 'jimin', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(3, 'ola', 'bonang', '8745567', NULL, '2005-12-13', 'Perempuan', NULL, NULL, NULL),
(4, 'hanna', 'grand sutera', '081385381166', NULL, '2006-01-16', 'Perempuan', NULL, NULL, NULL),
(5, 'hanna pauline', NULL, NULL, NULL, NULL, NULL, NULL, 6, NULL),
(6, 'Daveed Arden Tulungallo', 'grand sutera raya blok B7 no 9', '43764338', 'tangerang', '2007-03-30', 'Laki-laki', 'dvdrdn2007@gmail.com', 7, 'https://th.bing.com/th/id/OIP.OTRFuVhYp_z_bJIdSZqtoAHaKt?w=202&h=293&c=7&r=0&o=7&cb=12&pid=1.7&rm=3'),
(7, 'Agnes Monica', 'Jl. Kebon Jeruk No. 5', '08123456701', 'Jakarta', '1986-07-01', 'Perempuan', 'agnes.m@email.com', NULL, NULL),
(8, 'Bambang Pamungkas', 'Jl. Merdeka Raya No. 10', '08123456702', 'Semarang', '1980-06-10', 'Laki-laki', 'bambang.p@email.com', NULL, NULL),
(9, 'Citra Kirana', 'Perumahan Indah Blok C2', '08123456703', 'Bandung', '1994-04-23', 'Perempuan', 'citra.k@email.com', NULL, NULL),
(10, 'Dion Wiyoko', 'Apartemen Sudirman Tower A', '08123456704', 'Surabaya', '1984-05-08', 'Laki-laki', 'dion.w@email.com', NULL, NULL),
(11, 'Erina Gudono', 'Jl. Mawar Putih No. 15', '08123456705', 'Yogyakarta', '1996-12-11', 'Perempuan', 'erina.g@email.com', NULL, NULL),
(12, 'Fiersa Besari', 'Komplek Pegunungan Asri', '08123456706', 'Bandung', '1984-03-03', 'Laki-laki', 'fiersa.b@email.com', NULL, NULL),
(13, 'Gisella Anastasia', 'Jl. Palem Hijau Blok D', '08123456707', 'Surabaya', '1990-11-16', 'Perempuan', 'gisella.a@email.com', NULL, NULL),
(14, 'Hanung Bramantyo', 'Griya Kencana III No. 22', '08123456708', 'Yogyakarta', '1975-10-01', 'Laki-laki', 'hanung.b@email.com', NULL, NULL),
(15, 'Iqbaal Ramadhan', 'Jl. Pendidikan No. 7', '08123456709', 'Surabaya', '1999-12-28', 'Laki-laki', 'iqbaal.r@email.com', NULL, NULL),
(16, 'Jasmine Suraya', 'Komplek Harapan Jaya F4', '08123456710', 'Jakarta', '1995-07-29', 'Perempuan', 'jasmine.s@email.com', NULL, NULL),
(17, 'Kevin Sanjaya', 'Apartemen Serpong Garden', '08123456711', 'Semarang', '1996-08-02', 'Laki-laki', 'kevin.s@email.com', NULL, NULL),
(18, 'Luna Maya', 'Jl. Menteng Dalam No. 3', '08123456712', 'Denpasar', '1983-08-26', 'Perempuan', 'luna.m@email.com', NULL, NULL),
(19, 'Marcelino Lefrandt', 'Perumahan Cendana Blok G', '08123456713', 'Manado', '1974-07-19', 'Laki-laki', 'marcelino.l@email.com', NULL, NULL),
(20, 'Nagita Slavina', 'Jl. Andara No. 8', '08123456714', 'Jakarta', '1988-02-17', 'Perempuan', 'nagita.s@email.com', NULL, NULL),
(21, 'Olla Ramlan', 'Townhouse Kemang Village', '08123456715', 'Banjarmasin', '1980-02-15', 'Perempuan', 'olla.r@email.com', NULL, NULL),
(22, 'Pevita Pearce', 'Jl. Cikini Raya No. 1', '08123456716', 'Jakarta', '1992-10-06', 'Perempuan', 'pevita.p@email.com', NULL, NULL),
(23, 'Quraish Shihab', 'Komplek Dosen UIN', '08123456717', 'Makassar', '1944-02-16', 'Laki-laki', 'quraish.s@email.com', NULL, NULL),
(24, 'Raffi Ahmad', 'Jl. Andara No. 8', '08123456718', 'Bandung', '1987-02-17', 'Laki-laki', 'raffi.a@email.com', NULL, NULL),
(25, 'Susi Susanti', 'Perumahan Atlantis Blok S', '08123456719', 'Tasikmalaya', '1971-02-11', 'Perempuan', 'susi.s@email.com', NULL, NULL),
(26, 'Tulus', 'Apartemen Kuningan Suites', '08123456720', 'Bukittinggi', '1987-08-20', 'Laki-laki', 'tulus.m@email.com', NULL, NULL),
(27, 'Ussy Sulistiawaty', 'Jl. Cempaka Indah No. 4', '08123456721', 'Jakarta', '1981-07-13', 'Perempuan', 'ussy.s@email.com', NULL, NULL),
(28, 'Vidi Aldiano', 'Rumah Mewah Pondok Indah', '08123456722', 'Jakarta', '1990-03-29', 'Laki-laki', 'vidi.a@email.com', NULL, NULL),
(29, 'Wulan Guritno', 'Jl. Jati Padang No. 6', '08123456723', 'London', '1981-04-14', 'Perempuan', 'wulan.g@email.com', NULL, NULL),
(30, 'Yayan Ruhian', 'Kampung Silat Cimande', '08123456724', 'Tasikmalaya', '1968-10-19', 'Laki-laki', 'yayan.r@email.com', NULL, NULL),
(31, 'Zaskia Sungkar', 'Jl. Bunga Melati IV', '08123456725', 'Jakarta', '1990-12-22', 'Perempuan', 'zaskia.s@email.com', NULL, NULL),
(33, 'Bunga Citra Lestari', 'Jl. Raya Cinere No. 9', '08123456727', 'Jakarta', '1983-03-22', 'Perempuan', 'bunga.c@email.com', NULL, NULL),
(34, 'Cinta Laura', 'Perumahan Beverly Hills', '08123456728', 'Quakenbrück', '1993-08-17', 'Perempuan', 'cinta.l@email.com', NULL, NULL),
(35, 'Daniel Mananta', 'Apartemen Puri Parkview', '08123456729', 'Jakarta', '1981-08-14', 'Laki-laki', 'daniel.m@email.com', NULL, NULL),
(36, 'Eva Celia', 'Jl. Bangka VIII', '08123456730', 'Jakarta', '1992-09-21', 'Perempuan', 'eva.c@email.com', NULL, NULL),
(37, 'Gading Marten', 'Perumahan Greenville', '08123456731', 'Jakarta', '1982-05-08', 'Laki-laki', 'gading.m@email.com', NULL, NULL),
(38, 'Isyana Sarasvati', 'Cluster Taman Sari', '08123456732', 'Bandung', '1993-05-02', 'Perempuan', 'isyana.s@email.com', NULL, NULL),
(39, 'Joe Taslim', 'Jl. Veteran No. 1', '08123456733', 'Palembang', '1981-06-23', 'Laki-laki', 'joe.t@email.com', NULL, NULL),
(40, 'Maudy Ayunda', 'Townhouse Menteng', '08123456734', 'Jakarta', '1994-12-19', 'Perempuan', 'maudy..a@email.com', NULL, NULL),
(41, 'Nicholas Saputra', 'Jl. Raya Bogor KM 20', '08123456735', 'Jakarta', '1984-02-24', 'Laki-laki', 'nicholas.s@email.com', NULL, NULL),
(42, 'Raisa Andriana', 'Apartemen Pakubuwono', '08123456736', 'Jakarta', '1990-06-06', 'Perempuan', 'raisa.a@email.com', NULL, NULL),
(43, 'Rio Dewanto', 'Jl. Senopati No. 5', '08123456737', 'Jakarta', '1987-08-28', 'Laki-laki', 'rio.d@email.com', NULL, NULL),
(44, 'Sherina Munaf', 'Perumahan Pondok Hijau', '08123456738', 'Bandung', '1990-06-11', 'Perempuan', 'sherina.m@email.com', NULL, NULL),
(45, 'Tanta Ginting', 'Komplek Puri Beta', '08123456739', 'Medan', '1984-10-16', 'Laki-laki', 'tanta.g@email.com', NULL, NULL),
(46, 'Tara Basro', 'Jl. Kebayoran Lama No. 3', '08123456740', 'Jakarta', '1990-06-11', 'Perempuan', 'tara.b@email.com', NULL, NULL),
(47, 'Tompi', 'Klinik Estetika Jakarta', '08123456741', 'Lhokseumawe', '1978-09-21', 'Laki-laki', 'tompi.t@email.com', NULL, NULL),
(48, 'Yuki Kato', 'Jl. RS Fatmawati', '08123456742', 'Malang', '1995-04-02', 'Perempuan', 'yuki.k@email.com', NULL, NULL),
(49, 'Zulfa Maharani', 'Apartemen Central Park', '08123456743', 'Jakarta', '1999-12-29', 'Perempuan', 'zulfa.m@email.com', NULL, NULL),
(50, 'Anya Geraldine', 'Cluster Alam Sutera', '08123456744', 'Jakarta', '1995-12-15', 'Perempuan', 'anya.g@email.com', NULL, NULL),
(51, 'Atta Halilintar', 'Rumah Gedongan Cinere', '08123456745', 'Pekanbaru', '1994-11-20', 'Laki-laki', 'atta.h@email.com', NULL, NULL),
(52, 'Dinda Hauw', 'Perumahan Elite Jatiasih', '08123456746', 'Palembang', '1996-11-14', 'Perempuan', 'dinda.h@email.com', NULL, NULL),
(53, 'Jefri Nichol', 'Apartemen Thamrin City', '08123456747', 'Jakarta', '1999-01-15', 'Laki-laki', 'jefri.n@email.com', NULL, NULL),
(54, 'Lesti Kejora', 'Komplek Perumahan Serang', '08123456748', 'Bandung', '1999-08-05', 'Perempuan', 'lesti.k@email.com', NULL, NULL),
(55, 'Rizky Febian', 'Jl. Pajajaran No. 3', '08123456749', 'Bandung', '1998-02-25', 'Laki-laki', 'rizky.f@email.com', NULL, NULL),
(56, 'Tiara Andini', 'Cluster Bintaro Jaya', '08123456750', 'Jember', '2001-09-23', 'Perempuan', 'tiara.a@email.com', NULL, NULL);

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;